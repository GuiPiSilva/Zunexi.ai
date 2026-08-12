import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { consumeAccessCredit, requirePlanFeature, requireTenantContext } from "@/lib/access.functions";
import { brandContextAsPrompt, resolveBrandContext } from "@/lib/brand.functions";
import { explicitHumanVisualRequest, explicitInterfaceVisualRequest } from "@/lib/creative-engine";
import { LAYOUT_IDS } from "@/lib/layouts";

function admin() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const Input = z.object({
  jobId: z.string().uuid(),
  accessKey: z.string().trim().min(4).max(64),
  tema: z.string().trim().min(3).max(3000),
  objetivo: z.string().trim().max(300).optional().default(""),
  publicoAlvo: z.string().trim().max(300).optional().default(""),
  tom: z.string().trim().max(100).optional().default("profissional"),
  quantidadeSlides: z.number().int().min(1).max(20),
  informacoesAdicionais: z.string().trim().max(3000).optional().default(""),
  brandId: z.string().uuid().optional().nullable(),
});

export interface CreativePlanOut {
  centralIdea: string;
  visualSignature: string;
  audienceInsight: string;
  peoplePolicy: "disabled" | "explicitly-requested";
  avoidPatterns: string[];
}

export interface SlideOut {
  numero: number;
  titulo: string;
  texto: string;
  cta?: string;
  promptImagem: string;
  tipo: string;
  layout?: string;
  visualConcept?: string;
  textZone?: string;
  subjectZone?: string;
  camera?: string;
  lighting?: string;
  allowPeople?: boolean;
  reviewScore?: number;
}
export interface CarrosselOut {
  id: string;
  titulo: string;
  legenda: string;
  hashtags: string[];
  slides: SlideOut[];
  creativePlan?: CreativePlanOut;
}

const TIMEOUT_MS = 45_000;
const DEFAULT_GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";

type GroqChatRequest = {
  temperature?: number;
  top_p?: number;
  max_completion_tokens?: number;
  response_format?: { type: "json_object" };
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

function configuredGroqModel() {
  let value = (process.env.GROQ_TEXT_MODEL || DEFAULT_GROQ_TEXT_MODEL).trim();
  if (/^GROQ_TEXT_MODEL\s*=/i.test(value)) value = value.replace(/^GROQ_TEXT_MODEL\s*=\s*/i, "");
  return value.replace(/^["']|["']$/g, "").trim() || DEFAULT_GROQ_TEXT_MODEL;
}

function groqErrorDetail(body: string) {
  try {
    const payload = JSON.parse(body) as { error?: { message?: unknown; code?: unknown }; message?: unknown };
    const detail = payload.error?.message ?? payload.message;
    if (typeof detail === "string" && detail.trim()) return compactWhitespace(detail).slice(0, 280);
  } catch {
    // Some proxy and provider errors are returned as plain text.
  }
  return compactWhitespace(body).slice(0, 280);
}

function isUnavailableGroqModel(status: number, detail: string) {
  return status === 400 && /model/i.test(detail) && /(?:decommission|deprecated|not found|does not exist|invalid|unavailable|permission)/i.test(detail);
}

function isGroqJsonModeFailure(status: number, detail: string) {
  return status === 400 && /(?:json_validate_failed|failed to generate json|json mode|valid json)/i.test(detail);
}

function groqResponseError(status: number, body: string, model: string) {
  const detail = groqErrorDetail(body);
  if (status === 401 || status === 403) return new Error("Chave da Groq inválida ou sem permissão.");
  if (status === 429) return new Error("Limite da Groq API atingido. Tente novamente em instantes.");
  if (status === 413) {
    return new Error(detail
      ? `A Groq recusou até o pedido mínimo (erro 413): ${detail}`
      : "A Groq recusou até o pedido mínimo (erro 413). Verifique os limites da conta e tente novamente.");
  }
  if (isUnavailableGroqModel(status, detail)) {
    return new Error(`O modelo da Groq \"${model}\" não está disponível. Configure GROQ_TEXT_MODEL=${DEFAULT_GROQ_TEXT_MODEL} na Vercel.`);
  }
  if (status >= 500) return new Error(`A Groq está temporariamente indisponível (erro ${status}). Tente novamente em instantes.`);
  return new Error(detail ? `A Groq recusou a solicitação (erro ${status}): ${detail}` : `A Groq recusou a solicitação (erro ${status}).`);
}

async function requestGroqChat(
  apiKey: string,
  request: GroqChatRequest,
  signal: AbortSignal,
  compactRequest?: GroqChatRequest,
  minimalRequest?: GroqChatRequest,
) {
  const selectedModel = configuredGroqModel();
  const models = Array.from(new Set([selectedModel, DEFAULT_GROQ_TEXT_MODEL]));
  let lastError: Error | undefined;

  async function send(model: string, payload: GroqChatRequest) {
    return fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({ ...payload, model }),
    });
  }

  for (const model of models) {
    let activeRequest = request;
    let response = await send(model, activeRequest);

    if (response.ok) return { response, model };

    let body = await response.text();
    let detail = groqErrorDetail(body);
    console.error("Groq error", response.status, model, detail);

    if (response.status === 413) {
      const smallerRequests = [compactRequest, minimalRequest]
        .filter((candidate): candidate is GroqChatRequest => Boolean(candidate));
      for (const smallerRequest of smallerRequests) {
        console.warn(`Pedido muito grande para ${model}; repetindo automaticamente com contexto menor.`);
        activeRequest = smallerRequest;
        response = await send(model, activeRequest);
        if (response.ok) return { response, model };
        body = await response.text();
        detail = groqErrorDetail(body);
        console.error("Groq reduced retry error", response.status, model, detail);
        if (response.status !== 413) break;
      }
    }

    if (activeRequest.response_format && isGroqJsonModeFailure(response.status, detail)) {
      console.warn(`Modo JSON da Groq falhou no modelo ${model}; repetindo com validação local.`);
      const { response_format: _responseFormat, ...requestWithoutJsonMode } = activeRequest;
      response = await send(model, requestWithoutJsonMode);
      if (response.ok) return { response, model };
      body = await response.text();
      detail = groqErrorDetail(body);
      console.error("Groq retry error", response.status, model, detail);
    }

    lastError = groqResponseError(response.status, body, model);

    const hasFallback = model !== models[models.length - 1];
    if (!hasFallback || !isUnavailableGroqModel(response.status, detail)) throw lastError;
    console.warn(`Modelo Groq ${model} indisponível; tentando ${DEFAULT_GROQ_TEXT_MODEL}.`);
  }

  throw lastError || new Error("Não foi possível consultar a Groq.");
}

const PLACEHOLDER_LINE = /(?:\[(?:inserir|adicione|preencha|coloque)[^\]]*\]|<(?:inserir|adicione|preencha|coloque)[^>]*>|\b(?:a definir|não informado|nao informado|não fornecido|nao fornecido|exemplo|seu telefone|seu endereço|seu endereco)\b)/i;
const WEAK_COPY = /^(?:bem[- ]?vindo|conheça|descubra|aproveite|saiba mais|qualidade que|sabor que|uma experiência|experiência única|o melhor para você|feito para você|não perca|crie agora|crie melhor|desbloqueie o poder|eleve sua marca|leve sua marca)(?:\b|[!.:]|$)/i;
const GENERIC_COPY = /\b(?:desbloqueie o poder|potencialize sua criatividade|crie melhor|crie agora|qualidade previsível|autonomia criativa|leve sua marca ao próximo nível|transforme seu negócio|solução completa|inovação que transforma|resultados incríveis)\b/i;

function compactWhitespace(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdown(value: string) {
  return value
    .replace(/```(?:json)?/gi, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ");
}

function removePlaceholderLines(value: string) {
  return value
    .split("\n")
    .filter((line) => !PLACEHOLDER_LINE.test(line))
    .join("\n");
}

function trimAtWord(value: string, limit: number) {
  if (value.length <= limit) return value;
  const slice = value.slice(0, limit + 1);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > limit * 0.65 ? boundary : limit).trim()}…`;
}

function sanitizeTitle(value: unknown) {
  const cleaned = compactWhitespace(removePlaceholderLines(stripMarkdown(String(value ?? ""))))
    .split("\n")
    .find(Boolean)
    ?.replace(/^[“"']|[”"']$/g, "")
    .replace(/[.!]+$/g, "")
    .trim() || "";
  return trimAtWord(cleaned, 82);
}

function sanitizeBody(value: unknown, dense: boolean) {
  const cleaned = compactWhitespace(removePlaceholderLines(stripMarkdown(String(value ?? ""))))
    .replace(/(^|\n)(?:texto|descrição|descricao|copy)\s*:\s*/gi, "$1")
    .trim();
  return trimAtWord(cleaned, dense ? 900 : 150);
}

function sanitizeCta(value: unknown) {
  const cleaned = compactWhitespace(removePlaceholderLines(stripMarkdown(String(value ?? ""))))
    .split("\n")
    .find(Boolean)
    ?.replace(/^(?:cta|chamada para a[cç][aã]o)\s*:\s*/i, "")
    .replace(/^[“"']|[”"']$/g, "")
    .trim() || "";
  return trimAtWord(cleaned, 54);
}

function sanitizePromptImage(value: unknown) {
  return compactWhitespace(String(value ?? ""))
    .replace(/```/g, "")
    .replace(/\b(?:add|include|render|write|display|place|show)\s+(?:the\s+)?(?:text|title|headline|subtitle|copy|words?|letters?|logo|price|phone|watermark)[^.;]*[.;]?/gi, "")
    .replace(/\b(?:no|without)\s+(?:text|typography|letters?|words?|captions?)\b/gi, "")
    .trim();
}

function parseJsonObject(raw: string): Omit<CarrosselOut, "id"> {
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned) as Omit<CarrosselOut, "id">;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as Omit<CarrosselOut, "id">;
    throw new Error("Resposta da Groq em formato inválido.");
  }
}

function copyQualityWarnings(slides: SlideOut[]) {
  const warnings: string[] = [];
  slides.forEach((slide) => {
    if (!slide.titulo) warnings.push(`slide ${slide.numero} sem título`);
    if (PLACEHOLDER_LINE.test(`${slide.titulo}\n${slide.texto}`)) warnings.push(`slide ${slide.numero} com placeholder`);
    if (WEAK_COPY.test(slide.titulo) || GENERIC_COPY.test(`${slide.titulo} ${slide.texto}`)) warnings.push(`slide ${slide.numero} com copy genérica`);
    if ((slide.texto || "").length > 220) warnings.push(`slide ${slide.numero} com texto longo demais`);
  });

  const normalizedTitles = slides.map((slide) => slide.titulo.toLowerCase().replace(/[^a-z0-9áéíóúãõâêôç ]/gi, "").trim());
  normalizedTitles.forEach((title, index) => {
    if (title && normalizedTitles.indexOf(title) !== index) warnings.push(`slide ${slides[index].numero} repete um título anterior`);
  });

  const repeatedStarts = new Map<string, number[]>();
  normalizedTitles.forEach((title, index) => {
    const start = title.split(/\s+/).slice(0, 2).join(" ");
    if (!start) return;
    repeatedStarts.set(start, [...(repeatedStarts.get(start) || []), slides[index].numero]);
  });
  repeatedStarts.forEach((nums, start) => {
    if (nums.length >= 3) warnings.push(`muitos títulos começam com "${start}"`);
  });

  const layouts = slides.map((slide) => slide.layout).filter(Boolean);
  for (let index = 1; index < layouts.length; index += 1) {
    if (layouts[index] === layouts[index - 1]) warnings.push("layouts consecutivos repetidos");
  }
  return warnings;
}

function sanitizeCreativeField(value: unknown, limit = 220) {
  return trimAtWord(compactWhitespace(stripMarkdown(String(value ?? ""))), limit);
}

function normalizeCreativePlan(value: unknown, allowPeople: boolean): CreativePlanOut | undefined {
  if (!value || typeof value !== "object") return undefined;
  const plan = value as Partial<CreativePlanOut>;
  const avoidPatterns = Array.isArray(plan.avoidPatterns)
    ? plan.avoidPatterns.map((item) => sanitizeCreativeField(item, 120)).filter(Boolean).slice(0, 8)
    : [];
  return {
    centralIdea: sanitizeCreativeField(plan.centralIdea, 240),
    visualSignature: sanitizeCreativeField(plan.visualSignature, 300),
    audienceInsight: sanitizeCreativeField(plan.audienceInsight, 220),
    peoplePolicy: allowPeople ? "explicitly-requested" : "disabled",
    avoidPatterns,
  };
}

function normalizeSlide(value: SlideOut, index: number, total: number, dense: boolean, allowPeople: boolean): SlideOut {
  const requestedLayout = sanitizeCreativeField(value.layout, 40);
  const layout = (LAYOUT_IDS as readonly string[]).includes(requestedLayout) ? requestedLayout : undefined;
  return {
    numero: index + 1,
    titulo: sanitizeTitle(value.titulo),
    texto: sanitizeBody(value.texto, dense),
    cta: sanitizeCta(value.cta),
    promptImagem: sanitizePromptImage(value.promptImagem),
    tipo: String(value.tipo ?? (index === 0 ? "capa" : index === total - 1 ? "cta" : "conteudo")),
    layout,
    visualConcept: sanitizeCreativeField(value.visualConcept, 240),
    textZone: sanitizeCreativeField(value.textZone, 40),
    subjectZone: sanitizeCreativeField(value.subjectZone, 40),
    camera: sanitizeCreativeField(value.camera, 100),
    lighting: sanitizeCreativeField(value.lighting, 100),
    allowPeople,
    reviewScore: typeof value.reviewScore === "number" ? Math.max(0, Math.min(100, Math.round(value.reviewScore))) : undefined,
  };
}

function applyReferenceLayoutSequence(slides: SlideOut[], softwareCampaign: boolean, dense: boolean, allowInterfaces: boolean) {
  if (!softwareCampaign || dense || !slides.length) return slides;
  const middle: Array<SlideOut["layout"]> = [
    "social-workflow",
    "social-cards",
    "social-feature-grid",
    "social-editorial",
    "social-minimal",
  ];
  return slides.map((slide, index) => {
    if (index === 0) {
      const imageLed = allowInterfaces && /(?:mockup|dashboard|interface|tela|site|app|produto)/i.test(`${slide.visualConcept || ""} ${slide.promptImagem || ""}`);
      return { ...slide, layout: imageLed ? "social-hero" : "social-editorial" };
    }
    if (index === slides.length - 1) return { ...slide, layout: "social-cta" };
    return { ...slide, layout: middle[(index - 1) % middle.length] };
  });
}

async function reviewCampaignWithGroq({
  apiKey,
  campaign,
  briefing,
  allowPeople,
}: {
  apiKey: string;
  campaign: Omit<CarrosselOut, "id">;
  briefing: string;
  allowPeople: boolean;
}): Promise<Omit<CarrosselOut, "id">> {
  if (process.env.GROQ_CREATIVE_REVIEW_ENABLED === "false") return campaign;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: (process.env.GROQ_REVIEW_MODEL || configuredGroqModel()).trim(),
        temperature: 0.25,
        top_p: 0.8,
        max_completion_tokens: 5000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Você é o revisor final da Zunexi. Receba um carrossel em JSON e devolva o MESMO formato JSON, corrigido e pronto para produção. Não explique nada. Preserve somente fatos autorizados pelo briefing. Elimine clichês, repetição de títulos, repetição de layouts, prompts visuais genéricos, placeholders e dados inventados. Reescreva qualquer copy que pareça slogan genérico de IA; prefira linguagem de anúncio clara, concreta e curta. Cada slide deve ter layout válido entre: ${LAYOUT_IDS.join(", ")}. Garanta que promptImagem esteja em inglês e descreva somente a cena sem texto. Pessoas estão ${allowPeople ? "permitidas porque foram solicitadas explicitamente" : "PROIBIDAS; remova pessoas, rostos, mãos, corpos e silhuetas de todos os prompts"}. Se a campanha for de software, IA, Zunexi ou conteúdo digital, elimine slogans vazios como “Crie melhor”, “Desbloqueie o poder”, “Autonomia criativa”, “Qualidade previsível” e equivalentes. Reescreva títulos para ficarem específicos, curtos e úteis; cada slide deve comunicar uma função, problema, mecanismo ou benefício diferente. Para layouts social-workflow, social-cards e social-feature-grid, preserve linhas curtas separadas por quebra de linha para alimentar os elementos gráficos. Troque prompts abstratos por metáforas visuais relevantes como cards, calendário, analytics, fluxo de publicação, mídia organizada e assets de marca. Se a campanha for de hamburgueria, restaurante ou alimentação, mantenha o produto gastronômico como herói em estúdio escuro premium; remova fachadas, placas, letreiros, cardápios fotografados, marcas inventadas e metáforas literais. Use enquadramentos variados do produto e preserve área livre coerente com o layout. Dê reviewScore de 0 a 100 para cada slide depois das correções.`,
          },
          {
            role: "user",
            content: `BRIEFING AUTORIZADO:
${briefing}

CAMPANHA A REVISAR:
${JSON.stringify(campaign)}`,
          },
        ],
      }),
    });
    if (!response.ok) return campaign;
    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) return campaign;
    const reviewed = parseJsonObject(raw);
    if (
      !reviewed || typeof reviewed.titulo !== "string" || typeof reviewed.legenda !== "string" ||
      !Array.isArray(reviewed.hashtags) || !Array.isArray(reviewed.slides) ||
      reviewed.slides.length < campaign.slides.length
    ) return campaign;
    return reviewed;
  } catch (error) {
    console.warn("Revisor criativo indisponível; usando primeira versão.", error);
    return campaign;
  } finally {
    clearTimeout(timeout);
  }
}

export const generateInstagramContent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<CarrosselOut> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no servidor.");

    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const keyId = context.access.id;
    const selectedBrand = await resolveBrandContext(sb, context, data.brandId);
    const selectedBrandPrompt = brandContextAsPrompt(selectedBrand);

    const { data: existing } = await (sb as any)
      .from("generations")
      .select("id, titulo, legenda, hashtags, slides")
      .eq("tenant_id", context.tenant.id)
      .eq("member_id", context.member.id)
      .eq("client_job_id", data.jobId)
      .maybeSingle();
    if (existing) {
      return {
        id: existing.id,
        titulo: existing.titulo,
        legenda: existing.legenda,
        hashtags: existing.hashtags as unknown as string[],
        slides: existing.slides as unknown as SlideOut[],
      };
    }

    await consumeAccessCredit(sb, data.accessKey, data.jobId);

    const brandMatch = data.informacoesAdicionais.match(/Marca:\s*(.+)/i);
    const productMatch = data.informacoesAdicionais.match(/Produto ou serviço:\s*(.+)/i);
    const styleMatch = data.informacoesAdicionais.match(/Estilo visual:\s*(.+)/i);
    const paletteMatch = data.informacoesAdicionais.match(/Paleta:\s*(.+)/i);
    const ctaMatch = data.informacoesAdicionais.match(/CTA:\s*(.+)/i);

    const brand = selectedBrand?.name || brandMatch?.[1]?.trim() || "marca do cliente";
    const product = productMatch?.[1]?.trim() || data.tema;
    const visualStyle = selectedBrand?.visualStyle || styleMatch?.[1]?.trim() || "publicidade premium, composição editorial forte, visual de campanha autoral";
    const palette = selectedBrand ? `${selectedBrand.primaryColor}, ${selectedBrand.secondaryColor}, ${selectedBrand.accentColor}` : paletteMatch?.[1]?.trim() || "paleta coerente com a marca, alto contraste";
    const requestedCta = ctaMatch?.[1]?.trim() || "";
    const denseContentMode = /card[aá]pio|menu|cat[aá]logo|lista|tabela|pre[cç]o|sabores|pizzas|bebidas|tradicionais|doces|promo[cç][aã]o/.test(
      `${data.tema} ${data.informacoesAdicionais} ${product}`.toLowerCase(),
    );
    const allowPeople = explicitHumanVisualRequest(data.tema, data.informacoesAdicionais, product);
    const allowInterfaces = explicitInterfaceVisualRequest(data.tema, data.informacoesAdicionais, product);
    const softwareCampaign = /zunexi|\bia\b|software|saas|app|aplicativo|plataforma|sistema|conte[uú]do|carrossel|posts?|publica[cç][aã]o|calend[aá]rio|agenda|automa[cç][aã]o|branding|analytics|marketing/i.test(`${data.tema}
${data.informacoesAdicionais}
${product}
${brand}`);
    const foodCampaign = /hamb|burger|food|comida|restaurante|lanche|pizza|sorvet|bebida|drink|caf[eé]|gastron|card[aá]pio|menu|combo|artesanal|bacon|cheddar|batata/i.test(`${data.tema}
${data.informacoesAdicionais}
${product}
${brand}`);
    const softwareCopyRule = softwareCampaign
      ? `
REGRAS ESPECIAIS PARA SOFTWARE / IA / ZUNEXI:
- A capa deve funcionar como headline de anúncio ou editorial: uma ideia específica, clara e memorável. Evite “mais que criar”, “crie melhor”, “desbloqueie o poder”, “autonomia criativa”, “qualidade previsível”, “potencialize sua criatividade” e qualquer slogan que serviria para qualquer SaaS.
- Prefira títulos concretos que nomeiem a função, o problema ou o ganho: ex. “Ideia + IA”, “Templates inteligentes”, “Texto que já nasce pronto”, “Publique sem perder o ritmo”, “Seu calendário em ordem”. Não copie estes exemplos literalmente; use a lógica.
- Cada slide intermediário deve trabalhar UMA função ou benefício por vez. Não repita “IA”, “conteúdo”, “criar” ou o nome da marca em todos os títulos.
- Para social-workflow: o campo texto deve ter 3 linhas curtas, uma etapa por linha, sem marcadores.
- Para social-cards: o campo texto deve ter 3 linhas curtas, uma ideia/benefício por linha.
- Para social-feature-grid: o campo texto deve ter 4 linhas curtas, um benefício por linha.
- Para social-editorial e social-minimal: use uma única frase curta de apoio; deixe a headline ser protagonista.
- Para social-cta: use CTA específico no campo cta, com 2 a 5 palavras. O campo texto deve explicar o benefício final em uma frase.
- Não escreva parágrafos longos. Não descreva a empresa de forma genérica. Mostre utilidade prática.
- Evite promessas vagas como “transforme seu negócio”, “leve sua marca ao próximo nível”, “inovação que transforma” e equivalentes.`
      : "";
    const softwareVisualRule = softwareCampaign
      ? `
DIREÇÃO VISUAL ESPECIAL PARA SOFTWARE / IA / ZUNEXI:
- A referência é design editorial premium de Instagram/SaaS: tipografia grande, grids, cards, contadores, acentos de cor, alternância dark/light e bastante respiro.
- NÃO transforme todos os slides em imagens 3D. Slides de conceito, processo, lista, benefício e CTA devem preferir os layouts social-* que o renderer monta sem IA de imagem.
- Use social-editorial ou social-minimal para mensagens fortes; social-workflow para processos; social-cards para 3 ideias; social-feature-grid para 4 benefícios; social-cta para fechamento.
- Use social-hero com imagem somente quando existir um assunto visual real que ajude a mensagem (produto, ambiente, objeto, mockup explicitamente solicitado).
- Se uma imagem for necessária, ela deve mostrar um objeto/ambiente semanticamente ligado ao slide. Proibido cristal, escultura, símbolo 3D ou forma abstrata aleatória apenas para “parecer tecnologia”.`
      : "";
    const foodCampaignRule = foodCampaign
      ? `
REGRAS ESPECIAIS PARA GASTRONOMIA:
- Trate o alimento ou bebida como produto de campanha: um herói grande, apetitoso e fisicamente coerente, com textura real, luz lateral controlada e fundo escuro sofisticado.
- A direção visual deve lembrar uma peça premium construída em camadas: fotografia do produto + moldura fina + contraste preto + acentos da paleta + tipografia aplicada depois pelo renderer.
- Não use fachada de restaurante, placa, letreiro, menu fotografado, embalagem com marca inventada, estrada ou cenário literal para representar frases da copy.
- Varie os slides entre close baixo, detalhe macro, vista oblíqua superior, composição lateral e encerramento com mais respiro. Preserve sempre a área de texto definida pelo layout.
- promptImagem descreve somente a fotografia limpa, sem palavras, logotipo, preço, telefone ou qualquer elemento tipográfico.
- A copy deve ser curta e comercial, sem inventar sabores, ingredientes, preços, promoções, endereço ou diferenciais que não estejam no briefing.`
      : "";

    const { data: recentRows } = await (sb as any)
      .from("generations")
      .select("titulo, slides, created_at")
      .eq("tenant_id", context.tenant.id)
      .neq("client_job_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(6);

    const recentCreativeMemory = (recentRows || []).map((row) => {
      const recentSlides = Array.isArray(row.slides) ? row.slides as unknown as SlideOut[] : [];
      return {
        titulo: row.titulo,
        slides: recentSlides.slice(0, 8).map((slide) => ({
          titulo: slide.titulo,
          layout: slide.layout,
          visualConcept: slide.visualConcept,
          prompt: String(slide.promptImagem || "").slice(0, 180),
        })),
      };
    });

    const socialLayoutSequence = [
      "social-hero",
      "social-workflow",
      "social-cards",
      "social-feature-grid",
      "social-editorial",
      "social-minimal",
      "social-cta",
    ] as const;

    const slideRoles = Array.from({ length: data.quantidadeSlides }, (_, index) => {
      const isFirst = index === 0;
      const isLast = index === data.quantidadeSlides - 1;
      const layout = isFirst
        ? "social-hero"
        : isLast
          ? "social-cta"
          : socialLayoutSequence[Math.min(index, socialLayoutSequence.length - 2)];
      const formatRule = layout === "social-workflow"
        ? "O campo texto deve conter 3 etapas curtas em linhas separadas, sem bullets."
        : layout === "social-feature-grid"
          ? "O campo texto deve conter 4 benefícios/itens curtos em linhas separadas, sem bullets."
          : layout === "social-cards"
            ? "O campo texto deve conter 3 ideias/benefícios curtos em linhas separadas."
            : "Use uma frase secundária curta e específica.";
      if (isFirst) return `Slide 1: CAPA — use layout ${layout}. Interrompa o scroll com promessa forte, específica e visualmente grande. ${formatRule}`;
      if (isLast) return `Slide ${index + 1}: CTA — use layout ${layout}. Feche a narrativa com benefício claro e ação simples. ${formatRule}`;
      if (index === 1) return `Slide ${index + 1}: CONTEXTO / FLUXO — use layout ${layout}. Mostre uma sequência, transformação ou mecanismo em 3 passos. ${formatRule}`;
      if (index === 2) return `Slide ${index + 1}: SOLUÇÃO / POSSIBILIDADES — use layout ${layout}. Mostre 3 possibilidades, recursos ou resultados diferentes. ${formatRule}`;
      if (index === 3) return `Slide ${index + 1}: BENEFÍCIOS — use layout ${layout}. Mostre 4 benefícios concretos e curtos. ${formatRule}`;
      if (data.objetivo.toLowerCase().includes("vender")) {
        return `Slide ${index + 1}: DIFERENCIAL DE VENDA — use layout ${layout}. Aprofunde uma vantagem concreta sem repetir o slide anterior. ${formatRule}`;
      }
      return `Slide ${index + 1}: BENEFÍCIO / DETALHE — use layout ${layout}. Desenvolva uma ideia concreta e visualmente distinta. ${formatRule}`;
    }).join("\n");

    const systemPrompt = `Você é um diretor de criação e copywriter sênior de campanhas para Instagram. Crie conteúdo que pareça escrito para ESTA marca e ESTE pedido, não um texto genérico reutilizável. O resultado será aplicado diretamente em uma arte profissional; por isso, toda frase precisa ser útil, específica, curta e visualmente legível.

Retorne SOMENTE JSON válido, sem cercas de código, no formato EXATO:
{
  "titulo": "Título principal do carrossel",
  "legenda": "Legenda completa para Instagram, com quebras de linha e CTA no final",
  "hashtags": ["hashtag1", "hashtag2"],
  "creativePlan": {
    "centralIdea": "ideia central específica da campanha",
    "visualSignature": "assinatura visual que une os slides",
    "audienceInsight": "insight útil sobre o público sem inventar fatos",
    "peoplePolicy": "disabled ou explicitly-requested",
    "avoidPatterns": ["padrões visuais e verbais que não devem ser repetidos"]
  },
  "slides": [
    {
      "numero": 1,
      "titulo": "Texto principal do slide",
      "texto": "Texto secundário do slide",
      "cta": "CTA curto somente quando fizer sentido; vazio nos demais slides",
      "promptImagem": "Direção de arte em inglês, somente para a imagem sem texto",
      "tipo": "capa",
      "layout": "social-hero",
      "visualConcept": "conceito visual específico deste slide",
      "textZone": "left",
      "subjectZone": "right",
      "camera": "close-up low three-quarter angle",
      "lighting": "controlled cinematic rim light",
      "allowPeople": false,
      "reviewScore": 95
    }
  ]
}

PLANEJAMENTO OBRIGATÓRIO:
${slideRoles}

PROCESSO CRIATIVO OBRIGATÓRIO:
- Escolha primeiro um ângulo central claro para a campanha. Todos os slides devem desenvolver esse ângulo em sequência.
- Cada slide precisa ter uma função diferente. Não repita a mesma promessa com outras palavras.
- A capa deve interromper o scroll com uma promessa, tensão, benefício ou ideia específica; nunca use uma simples saudação à marca.
- Os slides intermediários devem avançar a narrativa com informação concreta, benefício, detalhe do produto, objeção, comparação, prova permitida ou orientação prática.
- O último slide deve encerrar a ideia e indicar uma ação coerente. Use o CTA fornecido quando existir.
- Defina uma creativePlan antes dos slides. Ela deve unir a campanha sem tornar as composições iguais.
- Escolha para cada slide um layout válido entre: ${LAYOUT_IDS.join(", ")}. Nunca repita o mesmo layout em slides consecutivos, exceto menu-board quando o conteúdo realmente for denso.
- Priorize a nova família social-* para posts e carrosséis. Ela foi criada para peças com hierarquia forte, cards, etapas, grids e alternância entre slides claros e escuros.
- Use social-hero para anúncio com um visual realmente relevante; social-workflow para processo em 3 etapas; social-cards para 3 ideias; social-feature-grid para 4 benefícios; social-editorial para headline forte; social-minimal para uma mensagem de alto impacto com muito respiro; social-cta para fechamento.
- Em campanhas de software/IA, a capa deve preferir social-editorial ou social-minimal. Use social-hero na capa somente se houver um produto visual, interface/mockup solicitado ou objeto concreto que enriqueça a mensagem.
- Os layouts social-workflow, social-cards, social-feature-grid, social-editorial, social-minimal e social-cta são construídos pelo renderer e NÃO dependem de uma imagem de IA. Por isso, o texto precisa ser bom o bastante para ser o protagonista.
- textZone e subjectZone devem ser opostos ou claramente separados para proteger a legibilidade.

REFERÊNCIA DE DIREÇÃO DE ARTE:
- Busque o nível de acabamento de posts premium de tecnologia, marketing e SaaS: tipografia grande, contraste forte, muito respiro, pequenos acentos de cor, cards limpos, contadores 01/06, alternância dark/light e composição de anúncio.
- Evite o visual de "imagem de IA com texto por cima". A peça deve parecer design gráfico criado por um diretor de arte.
- Nem todo slide precisa de fotografia ou 3D. Em slides de conceito, processo, lista e CTA, prefira design tipográfico e elementos gráficos simples.
- Varie entre: headline editorial em fundo sólido; fluxo em 3 etapas; cards modulares; grade 2x2 de benefícios; anúncio com visual à direita; fechamento centralizado com CTA. Isso deve criar ritmo de carrossel sem perder a identidade.

REGRAS DE COPY — PRIORIDADE MÁXIMA:
- Escreva em português brasileiro natural, correto e contemporâneo.
- Títulos: de 2 a 6 palavras, preferencialmente entre 16 e 44 caracteres. Devem soar como headline de anúncio, não como frase de IA. Evite slogans vagos. Varie a construção sintática entre os slides.
- Texto secundário padrão: 1 frase curta ou até 3 linhas objetivas, com aproximadamente 35 a 110 caracteres no total. Prefira clareza e impacto a explicações longas.
- Para cardápio, catálogo, lista ou preços realmente fornecidos, organize o texto em linhas simples e legíveis. Não use Markdown, #, **, tabelas ou blocos de código.
- PROIBIDO usar placeholders ou campos fictícios, como “[inserir endereço]”, “[telefone]”, “a definir”, “não informado” ou “seu contato”. Quando um dado não foi fornecido, simplesmente não o mencione.
- PROIBIDO inventar preço, desconto, sabor, ingrediente, número, endereço, telefone, data, depoimento, resultado, garantia ou condição comercial.
- PROIBIDO escrever títulos vazios ou clichês como “Bem-vindo”, “Conheça”, “Descubra”, “Aproveite”, “Saiba mais”, “Qualidade que você merece”, “Sabor que conquista”, “Experiência única” e variações, salvo quando a frase receber informação específica que a torne indispensável.
- Não use linguagem de bastidor (“neste slide”, “o objetivo é”, “a marca deve”). Escreva somente a copy que aparecerá ao público.
- Não repita palavras-chave em todos os títulos. Não comece vários slides do mesmo jeito.
- Evite repetir a assinatura verbal da marca em todos os slides. Uma mesma frase não deve sustentar mais de um slide.
- Se o briefing tiver poucos dados, trabalhe com posicionamento e benefícios plausíveis da categoria, sem fingir fatos específicos sobre a empresa.
- Campo cta: deixe vazio em slides normais. No fechamento, use somente uma ação curta, específica e coerente com o briefing. Nunca invente telefone, link, preço ou condição.
- Hashtags: 8 a 15, relevantes, sem # no JSON e sem termos aleatórios.${softwareCopyRule}

PADRÃO DE QUALIDADE VISUAL:
- Pense como diretor de arte de uma campanha real. Cada slide precisa ter um conceito visual deliberado, não apenas “uma foto bonita”.
- O produto, serviço ou assunto deve ser o herói. Evite cenas genéricas de escritório, restaurante, cidade ou pessoas sorrindo sem função narrativa.
- Não faça todos os slides com o mesmo enquadramento. Preserve a assinatura visual da campanha, mas varie câmera, distância, perspectiva e posição do assunto.
- Em alimentação, use fotografia gastronômica de campanha: produto dominante, textura real, luz controlada, profundidade e cores naturais dos ingredientes. Não aplique filtro laranja ou bege global.
- Em tecnologia, use key visual de lançamento com materiais precisos, luz escultural, composição limpa e sofisticada. Prefira metáforas visuais relevantes para criação de conteúdo, publicação, organização, fluxo criativo, camadas de mídia, brand assets e produção digital; evite símbolo 3D aleatório, hologramas genéricos e circuitos clichês sem motivo.
- Em automotivo, preserve proporções e use linguagem de campanha automotiva, não foto comum de concessionária.
- A paleta da marca deve aparecer como acentos controlados, nunca como banho monocromático sobre toda a imagem.

REGRAS DO promptImagem:
- Escreva em inglês, com direção de arte específica.
- Descreva SOMENTE o visual principal: hero subject, environment, camera, lens, lighting, materials, depth, color treatment and composition.
- Indique claramente o herói, posição no quadro, luz, distância/ângulo de câmera, textura/material e estética de campanha. O herói deve representar a mensagem do slide, não apenas ser um objeto bonito.
- NÃO solicite texto, tipografia, letras, números, logotipo, preço, telefone, watermark, moldura ou palavras dentro da imagem. O motor deve gerar SOMENTE o fundo/cena.
- Interfaces, dashboards, telas, browser windows e mockups de dispositivos estão ${allowInterfaces ? "permitidos SOMENTE porque foram pedidos explicitamente; ainda assim, evite pseudo-texto e use a interface como elemento secundário" : "PROIBIDOS. Para temas de tecnologia/software, traduza o conceito em objetos, luz, materiais, geometria e ambiente — nunca invente uma tela de app"}.
- Reserve negative space natural para a copy; não crie painel branco vazio, faixa sólida, cartão artificial ou metade branca sem motivo.
- Use cores locais naturais e acentos controlados da marca.
- Evite stock photo, generic modern interior, generic smiling person, objetos duplicados, mãos deformadas e fundos poluídos.
- Em alimentação ou produto físico, faça o produto ocupar cerca de 35–55% da cena quando adequado.${softwareVisualRule}${foodCampaignRule}

Antes de responder, revise silenciosamente cada slide e elimine: clichês, repetição, placeholders, dados inventados, Markdown e frases que poderiam servir para qualquer empresa.`;

    const userPrompt = `Crie o carrossel completo usando apenas os dados abaixo.

BRIEFING AUTORIZADO:
${selectedBrandPrompt}

Tema: ${data.tema}
Marca: ${brand === "marca do cliente" ? "não fornecida — não invente nome" : brand}
Produto ou serviço: ${product}
Objetivo: ${data.objetivo || "engajamento"}
Público-alvo: ${data.publicoAlvo || "não especificado"}
Tom de comunicação: ${data.tom}
Quantidade de slides: ${data.quantidadeSlides}
Estilo visual: ${visualStyle}
Paleta: ${palette}
CTA fornecido: ${requestedCta || "não fornecido — crie apenas uma ação genérica coerente, sem telefone, endereço ou link"}
Informações adicionais: ${data.informacoesAdicionais || "nenhuma"}
Política de pessoas: ${allowPeople ? "Pessoas permitidas porque o pedido visual as solicitou explicitamente." : "SEM PESSOAS. Não use pessoas, rostos, mãos, corpos, silhuetas ou multidões."}
Política de interfaces: ${allowInterfaces ? "Tela/interface permitida porque o usuário pediu explicitamente; não invente texto legível." : "SEM TELAS OU UI. Não crie dashboard, app, navegador, smartphone com interface, screenshot ou mockup de software."}

MEMÓRIA CRIATIVA RECENTE — não copie títulos, conceitos, enquadramentos ou sequências de layout abaixo:
${recentCreativeMemory.length ? JSON.stringify(recentCreativeMemory) : "nenhuma criação anterior disponível"}

Faça uma campanha contínua e específica. Não use saudações de abertura, texto de apresentação genérico, placeholders ou dados que não estejam no briefing. O promptImagem de cada slide deve gerar somente a fotografia/ilustração principal sem texto.
Se o tema envolver Zunexi, software, IA, conteúdo, criação, agenda, publicação, branding ou automação, traduza cada slide em uma metáfora visual coerente com o assunto: content cards, publishing flow, organized brand assets, modular creative blocks, media layers, scheduling cues ou structured digital production. Evite símbolo 3D aleatório ou ícone abstrato sem relação clara com a mensagem.
${softwareCampaign ? "Para esse tipo de campanha, privilegie copy curta, visualmente forte e orientada a benefício. A composição final pode parecer mais editorial e gráfica do que fotográfica." : ""}
${foodCampaign ? "Para esta campanha gastronômica, cada prompt deve mostrar o produto em estúdio escuro premium, sem fachadas, placas, letreiros ou marcas inventadas. Varie câmera e posição do produto conforme o layout." : ""}
${denseContentMode ? "MODO DENSO: use conteúdo mais completo apenas quando os itens e dados estiverem presentes no briefing. Organize em linhas simples, sem Markdown." : "MODO PADRÃO: mantenha a copy enxuta, forte e com informação real em todos os slides."}
Semente de variação criativa: ${Math.random().toString(36).slice(2)}-${Date.now()}`;

    const compactSystemPrompt = `Você é diretor de criação e copywriter. Retorne SOMENTE JSON válido:
{"titulo":"","legenda":"","hashtags":[""],"creativePlan":{"centralIdea":"","visualSignature":"","audienceInsight":"","peoplePolicy":"disabled","avoidPatterns":[]},"slides":[{"numero":1,"titulo":"","texto":"","cta":"","promptImagem":"","tipo":"capa","layout":"social-hero","visualConcept":"","textZone":"left","subjectZone":"right","camera":"","lighting":"","allowPeople":false,"reviewScore":95}]}

Crie exatamente ${data.quantidadeSlides} slides em português brasileiro. Use somente fatos do briefing. Títulos com 2 a 6 palavras e textos curtos. Não use clichês, placeholders, Markdown ou dados inventados. No último slide use o CTA fornecido. Cada slide deve avançar a narrativa e usar composição diferente. promptImagem deve estar em inglês e descrever somente uma cena publicitária limpa, sem texto, letras, números, logotipo, preço ou telefone. Use layouts válidos: ${LAYOUT_IDS.join(", ")}. Preserve uma área de texto coerente com o layout. Pessoas estão ${allowPeople ? "permitidas somente quando necessárias" : "proibidas"}. Interfaces estão ${allowInterfaces ? "permitidas somente quando necessárias" : "proibidas"}.${foodCampaign ? " Para gastronomia: produto grande e realista em estúdio preto premium, luz lateral, texturas naturais, acentos da paleta; nunca fachada, placa, letreiro, menu fotografado ou marca inventada. Varie close baixo, macro, vista oblíqua e composição lateral." : ""}`;

    const compactUserPrompt = `${trimAtWord(selectedBrandPrompt, 1200)}
Tema: ${trimAtWord(data.tema, 500)}
Marca: ${trimAtWord(brand === "marca do cliente" ? "não fornecida" : brand, 140)}
Produto: ${trimAtWord(product, 240)}
Objetivo: ${trimAtWord(data.objetivo || "engajamento", 100)}
Público: ${trimAtWord(data.publicoAlvo || "não especificado", 220)}
Tom: ${trimAtWord(data.tom, 80)}
Estilo: ${trimAtWord(visualStyle, 220)}
Cores: ${trimAtWord(palette, 140)}
CTA: ${trimAtWord(requestedCta || "ação coerente", 100)}
Extras: ${trimAtWord(data.informacoesAdicionais || "nenhuma", 500)}`;

    const emergencySystemPrompt = `Retorne somente JSON válido em português:
{"titulo":"","legenda":"","hashtags":[""],"slides":[{"numero":1,"titulo":"","texto":"","cta":"","promptImagem":"","tipo":"capa","layout":"social-hero","allowPeople":false}]}
Crie exatamente ${data.quantidadeSlides} slides usando apenas os fatos enviados. Título e texto curtos; CTA no último slide; promptImagem em inglês sem texto, letras, números ou logotipo.${foodCampaign ? " Gastronomia: use fotografia premium do produto em estúdio escuro, sem fachadas ou letreiros." : ""}`;

    const emergencyUserPrompt = `Tema: ${trimAtWord(data.tema, 260)}
Marca: ${trimAtWord(brand === "marca do cliente" ? "não fornecida" : brand, 120)}
Produto: ${trimAtWord(product, 180)}
Objetivo: ${trimAtWord(data.objetivo || "engajamento", 80)}
Público: ${trimAtWord(data.publicoAlvo || "não especificado", 150)}
Tom: ${trimAtWord(data.tom, 60)}
Cores: ${trimAtWord(palette, 110)}
CTA: ${trimAtWord(requestedCta || "ação coerente", 80)}`;

    const minimalSystemPrompt = `Retorne somente JSON válido:
{"titulo":"","legenda":"","hashtags":[""],"slides":[{"numero":1,"titulo":"","texto":"","cta":"","promptImagem":"","tipo":"capa","layout":"social-hero","allowPeople":false}]}
Crie exatamente ${data.quantidadeSlides} slides em português. Use apenas os fatos enviados. Copy curta; promptImagem em inglês e sem escrita.`;

    const minimalUserPrompt = `Tema: ${trimAtWord(data.tema, 160)}
Marca: ${trimAtWord(brand === "marca do cliente" ? "não fornecida" : brand, 80)}
Produto: ${trimAtWord(product, 110)}
Objetivo: ${trimAtWord(data.objetivo || "engajamento", 50)}
Público: ${trimAtWord(data.publicoAlvo || "não especificado", 80)}
Cores: ${trimAtWord(palette, 70)}
CTA: ${trimAtWord(requestedCta || "ação coerente", 60)}`;

    const completionTokenBudget = Math.min(3200, Math.max(700, 480 + data.quantidadeSlides * 140));
    const emergencyTokenBudget = Math.min(2400, Math.max(560, 400 + data.quantidadeSlides * 100));
    const minimalTokenBudget = Math.min(1800, Math.max(460, 340 + data.quantidadeSlides * 75));

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      ({ response } = await requestGroqChat(apiKey, {
          temperature: 0.5,
          top_p: 0.86,
          max_completion_tokens: completionTokenBudget,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: compactSystemPrompt },
            { role: "user", content: compactUserPrompt },
          ],
        }, controller.signal, {
          temperature: 0.42,
          top_p: 0.84,
          max_completion_tokens: emergencyTokenBudget,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: emergencySystemPrompt },
            { role: "user", content: emergencyUserPrompt },
          ],
        }, {
          temperature: 0.35,
          top_p: 0.82,
          max_completion_tokens: minimalTokenBudget,
          messages: [
            { role: "system", content: minimalSystemPrompt },
            { role: "user", content: minimalUserPrompt },
          ],
        }));
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") throw new Error("Tempo esgotado ao gerar. Tente novamente.");
      throw err.message ? err : new Error("Falha ao chamar a Groq API.");
    } finally { clearTimeout(t); }

    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("Resposta vazia da Groq.");
    let parsed = parseJsonObject(raw);

    if (
      !parsed || typeof parsed.titulo !== "string" || typeof parsed.legenda !== "string" ||
      !Array.isArray(parsed.hashtags) || !Array.isArray(parsed.slides) || parsed.slides.length === 0
    ) throw new Error("Resposta da Groq não segue o formato esperado.");

    const authorizedBriefing = `${selectedBrandPrompt}
Tema: ${data.tema}
Marca: ${brand}
Produto: ${product}
Objetivo: ${data.objetivo}
Público: ${data.publicoAlvo}
Tom: ${data.tom}
Estilo: ${visualStyle}
Paleta: ${palette}
CTA: ${requestedCta}
Informações: ${data.informacoesAdicionais}`;
    parsed = await reviewCampaignWithGroq({
      apiKey,
      campaign: parsed,
      briefing: authorizedBriefing,
      allowPeople,
    });

    let slides = parsed.slides.slice(0, data.quantidadeSlides).map((slide, index) =>
      normalizeSlide(slide, index, data.quantidadeSlides, denseContentMode, allowPeople),
    );
    slides = applyReferenceLayoutSequence(slides, softwareCampaign, denseContentMode, allowInterfaces);

    const warnings = copyQualityWarnings(slides);
    if (warnings.some((warning) => warning.includes("sem título"))) {
      throw new Error("A IA retornou um roteiro incompleto. Tente gerar novamente com mais detalhes sobre o produto ou serviço.");
    }
    if (warnings.length) console.warn("Avisos de qualidade da copy:", warnings);

    const hashtags = parsed.hashtags
      .map((hashtag) => compactWhitespace(String(hashtag)).replace(/^#+/, "").replace(/\s+/g, ""))
      .filter(Boolean)
      .filter((hashtag, index, all) => all.indexOf(hashtag) === index)
      .slice(0, 15);
    const carouselTitle = sanitizeTitle(parsed.titulo) || slides[0]?.titulo || data.tema;
    const caption = sanitizeBody(parsed.legenda, true);
    const creativePlan = normalizeCreativePlan(parsed.creativePlan, allowPeople);

    const { data: inserted, error: insErr } = await (sb as any)
      .from("generations")
      .insert({
        access_key_id: keyId,
        tenant_id: context.tenant.id,
        member_id: context.member.id,
        brand_profile_id: selectedBrand?.id || null,
        client_job_id: data.jobId,
        tema: data.tema,
        objetivo: data.objetivo,
        publico_alvo: data.publicoAlvo,
        tom: data.tom,
        quantidade_slides: data.quantidadeSlides,
        informacoes_adicionais: data.informacoesAdicionais,
        titulo: carouselTitle,
        legenda: caption,
        hashtags,
        slides,
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error("Falha ao salvar geração no banco.");


    return { id: inserted.id, titulo: carouselTitle, legenda: caption, hashtags, slides, creativePlan };
  });

const UpdateSlideInput = z.object({
  accessKey: z.string().trim().min(4).max(64),
  generationId: z.string().uuid(),
  slideNumero: z.number().int().min(1),
  titulo: z.string().max(300),
  texto: z.string().max(2000),
});

export const updateSlide = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateSlideInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { data: row, error } = await (sb as any)
      .from("generations")
      .select("slides")
      .eq("id", data.generationId)
      .eq("tenant_id", context.tenant.id)
      .eq("member_id", context.member.id)
      .single();
    if (error || !row) throw new Error("Geração não encontrada.");
    const slides = (row.slides as unknown as SlideOut[]).map(s =>
      s.numero === data.slideNumero ? { ...s, titulo: data.titulo, texto: data.texto } : s,
    );
    const { error: upErr } = await (sb as any)
      .from("generations")
      .update({ slides })
      .eq("id", data.generationId)
      .eq("tenant_id", context.tenant.id)
      .eq("member_id", context.member.id);
    if (upErr) throw new Error("Falha ao salvar edições.");
    return { ok: true };
  });

export const testGroqConnection = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; model: string; message: string }> => {
    const apiKey = process.env.GROQ_API_KEY;
    const model = configuredGroqModel();
    if (!apiKey) return { ok: false, model, message: "GROQ_API_KEY não configurada no servidor." };
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    try {
      const { response: r, model: activeModel } = await requestGroqChat(apiKey, {
          temperature: 0,
          max_completion_tokens: 10,
          messages: [{ role: "user", content: "Responda apenas: OK" }],
        }, controller.signal);
      const j = await r.json() as { choices?: { message?: { content?: string } }[] };
      const txt = j.choices?.[0]?.message?.content?.trim() ?? "";
      return { ok: true, model: activeModel, message: `Conexão OK com ${activeModel}. Resposta: "${txt || "(vazia)"}"` };
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") return { ok: false, model, message: "Tempo esgotado ao contatar a Groq." };
      return { ok: false, model, message: err.message || "Falha de rede ao contatar a Groq." };
    } finally { clearTimeout(t); }
  });

const PromptCreatorInput = z.object({
  accessKey: z.string().trim().min(4).max(64),
  pedido: z.string().trim().min(3).max(1200),
  brandId: z.string().uuid().optional().nullable(),
  textProvider: z.enum(["groq", "lovable"]).optional().default("groq"),
});

export type CarouselPromptData = {
  prompt: string;
  tema: string;
  empresa: string;
  produto: string;
  objetivo: string;
  publicoAlvo: string;
  tom: string;
  quantidadeSlides: number;
  estilo: string;
  paleta: string;
  cta: string;
  informacoesAdicionais: string;
};

function normalizePromptData(value: Partial<CarouselPromptData>): CarouselPromptData {
  const allowedObjectives = ["vender", "educar", "engajar", "informar", "captar clientes"];
  const objetivo = allowedObjectives.includes(String(value.objetivo || "").toLowerCase())
    ? String(value.objetivo).toLowerCase()
    : "informar";

  return {
    prompt: String(value.prompt || "").trim().slice(0, 2400),
    tema: String(value.tema || "").trim(),
    empresa: String(value.empresa || "").trim(),
    produto: String(value.produto || "").trim(),
    objetivo,
    publicoAlvo: String(value.publicoAlvo || "").trim(),
    tom: String(value.tom || "profissional").trim() || "profissional",
    quantidadeSlides: Math.min(20, Math.max(1, Number(value.quantidadeSlides) || 5)),
    estilo: String(value.estilo || "publicidade premium").trim() || "publicidade premium",
    paleta: String(value.paleta || "roxo, azul, ciano e branco").trim() || "roxo, azul, ciano e branco",
    cta: String(value.cta || "").trim(),
    informacoesAdicionais: String(value.informacoesAdicionais || "").trim(),
  };
}

const PROMPT_CREATOR_SYSTEM = `Você é o estrategista criativo sênior da Zunexi.ai. Transforme o pedido do usuário em um briefing realmente utilizável para criar um carrossel profissional de Instagram, sem frases genéricas e sem inventar fatos.

O campo prompt pode ter até 2400 caracteres e deve ser um briefing operacional completo, escrito em português, contendo naturalmente: objetivo específico; promessa/ideia central; público; ângulo criativo; sequência narrativa sugerida; direção visual; composição; tratamento de imagem; orientação de copy; CTA; restrições e dados que NÃO podem ser inventados.

QUALIDADE OBRIGATÓRIA:
- Seja específico ao negócio, produto e pedido. Não gere um texto que serviria para qualquer empresa.
- Evite clichês como “transforme sua presença digital”, “leve sua marca para o próximo nível”, “desperte seu potencial”, “inove hoje” e variações vazias.
- A primeira tela deve ter um gancho concreto e visualmente forte; os slides seguintes devem avançar a história, não repetir a mesma ideia.
- Direção visual deve descrever hierarquia, foco, atmosfera, enquadramento e espaço natural para a copy.
- Nunca peça para o motor de imagem escrever textos, logos, preços, números, telas de app ou pseudo-interfaces dentro da imagem. A Zunexi aplica o texto depois.
- Pessoas só devem aparecer quando o pedido do usuário exigir explicitamente. Caso contrário, prefira objetos, produto, arquitetura, geometria, luz, textura e elementos abstratos coerentes.
- objetivo deve ser um destes: vender, educar, engajar, informar, captar clientes.
- quantidadeSlides deve ser entre 1 e 20; escolha a quantidade que realmente faz sentido, normalmente entre 5 e 8.
- Não invente nome de empresa, preço, telefone, endereço, resultados, depoimentos ou qualquer informação comercial.
- Quando houver Brand Kit, ele é obrigatório e deve definir empresa, tom, estilo, paleta, público e restrições.
- Quando um dado não existir, deixe vazio em vez de inventar.`;

const PROMPT_CREATOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    prompt: { type: "string" },
    tema: { type: "string" },
    empresa: { type: "string" },
    produto: { type: "string" },
    objetivo: { type: "string", enum: ["vender", "educar", "engajar", "informar", "captar clientes"] },
    publicoAlvo: { type: "string" },
    tom: { type: "string" },
    quantidadeSlides: { type: "integer", minimum: 1, maximum: 20 },
    estilo: { type: "string" },
    paleta: { type: "string" },
    cta: { type: "string" },
    informacoesAdicionais: { type: "string" },
  },
  required: ["prompt", "tema", "empresa", "produto", "objetivo", "publicoAlvo", "tom", "quantidadeSlides", "estilo", "paleta", "cta", "informacoesAdicionais"],
} as const;

async function callLovablePromptCreator(pedido: string, brandPrompt: string): Promise<string> {
  const key = (process.env.LOVABLE_API_KEY || "").trim();
  if (!key) throw new Error("LOVABLE_API_KEY não configurada no servidor.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.LOVABLE_TEXT_MODEL || "openai/gpt-5.6-sol",
        stream: true,
        input: [
          { role: "system", content: [{ type: "input_text", text: PROMPT_CREATOR_SYSTEM }] },
          { role: "user", content: [{ type: "input_text", text: `${brandPrompt}\n\nPedido do usuário: ${pedido}` }] },
        ],
        reasoning: { effort: "low", summary: "auto" },
        text: {
          format: {
            type: "json_schema",
            name: "zunexi_carousel_briefing",
            strict: true,
            schema: PROMPT_CREATOR_SCHEMA,
          },
        },
        store: false,
      }),
    });

    if (!response.ok || !response.body) {
      const raw = await response.text().catch(() => "");
      if (response.status === 402) throw new Error("Créditos do Lovable AI esgotados.");
      if (response.status === 429) throw new Error("Limite do Lovable AI atingido. Tente novamente em instantes.");
      if (response.status === 401 || response.status === 403) throw new Error("LOVABLE_API_KEY inválida ou sem permissão.");
      throw new Error(raw || `Lovable AI retornou erro ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data) as { type?: string; delta?: string; response?: { output_text?: string } };
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") out += event.delta;
          else if (event.type === "response.completed" && event.response?.output_text && !out) out = event.response.output_text;
        } catch { /* ignora frame SSE parcial */ }
      }
    }
    if (!out.trim()) throw new Error("O Lovable GPT-5.6 Sol retornou um prompt vazio.");
    return out.trim();
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("Tempo esgotado ao chamar o Lovable GPT-5.6 Sol.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const generateCarouselPrompt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PromptCreatorInput.parse(d))
  .handler(async ({ data }): Promise<CarouselPromptData> => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "criador_prompts");
    const selectedBrand = await resolveBrandContext(sb, context, data.brandId);
    const brandPrompt = brandContextAsPrompt(selectedBrand);

    if (data.textProvider === "lovable") {
      const content = await callLovablePromptCreator(data.pedido, brandPrompt);
      let parsed: Partial<CarouselPromptData>;
      try {
        parsed = JSON.parse(content) as Partial<CarouselPromptData>;
      } catch {
        parsed = { prompt: content, tema: data.pedido };
      }
      const normalized = normalizePromptData(parsed);
      if (!normalized.prompt) normalized.prompt = data.pedido.slice(0, 2400);
      if (!normalized.tema) normalized.tema = normalized.prompt;
      return normalized;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no servidor.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const { response } = await requestGroqChat(apiKey, {
          temperature: 0.45,
          max_completion_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${PROMPT_CREATOR_SYSTEM}

Retorne SOMENTE JSON válido com as chaves: prompt, tema, empresa, produto, objetivo, publicoAlvo, tom, quantidadeSlides, estilo, paleta, cta, informacoesAdicionais.`,
            },
            { role: "user", content: `${brandPrompt}

Pedido do usuário: ${data.pedido}` },
          ],
        }, controller.signal);

      const json = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("A Groq retornou um prompt vazio.");

      let parsed: Partial<CarouselPromptData>;
      try {
        parsed = JSON.parse(content) as Partial<CarouselPromptData>;
      } catch {
        parsed = { prompt: content, tema: data.pedido };
      }

      const normalized = normalizePromptData(parsed);
      if (!normalized.prompt) normalized.prompt = data.pedido.slice(0, 2400);
      if (!normalized.tema) normalized.tema = normalized.prompt;
      return normalized;
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error("Tempo esgotado ao criar o prompt. Tente novamente.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });


export const generateBrandContentIdeas = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({
    accessKey: z.string().trim().min(4).max(64),
    brandId: z.string().uuid().optional().nullable(),
    objective: z.string().trim().max(200).optional().default("crescer e gerar oportunidades"),
    quantity: z.number().int().min(3).max(20).optional().default(8),
  }).parse(value))
  .handler(async ({ data }): Promise<{ ideas: Array<{ title: string; angle: string; format: string; objective: string; prompt: string }> }> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no servidor.");
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "criador_prompts");
    const brand = await resolveBrandContext(sb, context, data.brandId);
    if (!brand) throw new Error("Cadastre ou selecione um Brand Kit para gerar ideias personalizadas.");
    const fallbackIdeas = () => {
      const pillars = brand.contentPillars.length ? brand.contentPillars : ["autoridade", "produto ou serviço", "educação", "objeções", "relacionamento"];
      const audience = brand.audience || "público da marca";
      const voice = brand.toneOfVoice || "claro, profissional e humano";
      const templates = [
        ["O que seu público ainda não percebeu", "carrossel", "educativo"],
        ["O erro que atrasa a decisão de compra", "post", "objeção"],
        ["Antes de escolher, compare isto", "carrossel", "comparação"],
        ["Como a marca resolve isso na prática", "reel", "demonstração"],
        ["Por trás de uma escolha melhor", "story", "bastidor"],
        ["O benefício que muda a experiência", "post", "comercial"],
        ["Uma dúvida comum, respondida sem enrolação", "carrossel", "autoridade"],
        ["Do problema ao próximo passo", "reel", "relacionamento"],
      ];
      return templates.slice(0, data.quantity).map(([title, format, angleType], index) => {
        const pillar = pillars[index % pillars.length];
        const angle = `Use o pilar “${pillar}” para falar com ${audience}. Trabalhe um ângulo de ${angleType}, mantendo o tom ${voice} e sem inventar dados da marca.`;
        const prompt = `Crie um conteúdo de formato ${format} para ${brand.name}, alinhado ao pilar “${pillar}” e ao objetivo “${data.objective}”. Gancho: ${title}. Público: ${audience}. Tom: ${voice}. Estruture a copy com uma ideia central clara, desenvolvimento curto e CTA coerente. Direção visual: ${brand.visualStyle || "visual profissional alinhado ao Brand Kit"}; use as cores ${brand.primaryColor}, ${brand.secondaryColor} e ${brand.accentColor}. Não gere texto dentro da imagem e não invente preços, números, depoimentos ou funcionalidades.`;
        return { title, angle, format, objective: data.objective, prompt: prompt.slice(0, 1200) };
      });
    };

    const requestBody = {
      model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.62,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Você é estrategista editorial e diretor criativo sênior da Zunexi.ai. Retorne somente JSON válido no formato {"ideas":[{"title":"...","angle":"...","format":"carrossel|cartaz|post|story|reel","objective":"...","prompt":"..."}]}.

REGRAS DE QUALIDADE:
- Cada ideia deve nascer de um insight, dor, objeção, desejo, comparação, bastidor, demonstração, prova permitida ou oportunidade específica do público descrito no Brand Kit.
- Não use títulos genéricos como “5 dicas”, “Você sabia?”, “Conheça nossos serviços”, “Transforme sua marca”, “Saiba mais” ou variações sem um ângulo concreto.
- title: curto, específico e diferente das outras ideias.
- angle: explique em 1–2 frases por que o conteúdo chama atenção e qual tensão/benefício explora.
- format: escolha o formato que melhor serve à ideia, não repita carrossel em tudo.
- prompt: escreva um mini-briefing operacional de 250–900 caracteres com gancho, sequência ou estrutura, direção de copy, direção visual e CTA; não peça texto dentro da imagem gerada.
- Varie os ângulos entre educativo, comercial, autoridade, objeção, comparação, produto/serviço e relacionamento quando fizer sentido.
- Respeite integralmente o Brand Kit e o objetivo atual.
- Não invente preços, resultados, depoimentos, estatísticas, clientes, funcionalidades, garantias ou fatos da empresa.
- Pessoas e interfaces só devem ser sugeridas quando o briefing/Brand Kit exigir explicitamente.` },
        { role: "user", content: `${brandContextAsPrompt(brand)}

Objetivo atual: ${data.objective}
Quantidade: ${data.quantity}` },
      ],
    };

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody),
      });
      if (response.ok) break;
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get("retry-after") || "0");
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(1100 * (2 ** attempt) + Math.floor(Math.random() * 500), 6000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (!response?.ok) {
      console.warn(`[brand-ideas] Groq indisponível (${response?.status || "sem resposta"}); usando fallback local baseado no Brand Kit.`);
      return { ideas: fallbackIdeas() };
    }

    try {
      const json = await response.json() as any;
      const raw = String(json.choices?.[0]?.message?.content || "{}").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(raw) as { ideas?: Array<Record<string, unknown>> };
      const ideas = (parsed.ideas || []).slice(0, data.quantity).map((idea) => ({
        title: String(idea.title || "Ideia de conteúdo"),
        angle: String(idea.angle || ""),
        format: String(idea.format || "carrossel"),
        objective: String(idea.objective || data.objective),
        prompt: String(idea.prompt || idea.title || "").slice(0, 1200),
      })).filter((idea) => idea.title.trim().length > 0);
      return { ideas: ideas.length ? ideas : fallbackIdeas() };
    } catch (error) {
      console.warn("[brand-ideas] Resposta inválida da Groq; usando fallback local.", error);
      return { ideas: fallbackIdeas() };
    }
  });
