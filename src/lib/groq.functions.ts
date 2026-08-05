import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { consumeAccessCredit, requireAccessKey } from "@/lib/access.functions";

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
});

interface SlideOut {
  numero: number;
  titulo: string;
  texto: string;
  promptImagem: string;
  tipo: string;
}
export interface CarrosselOut {
  id: string;
  titulo: string;
  legenda: string;
  hashtags: string[];
  slides: SlideOut[];
}

const TIMEOUT_MS = 45_000;

const PLACEHOLDER_LINE = /(?:\[(?:inserir|adicione|preencha|coloque)[^\]]*\]|<(?:inserir|adicione|preencha|coloque)[^>]*>|\b(?:a definir|não informado|nao informado|não fornecido|nao fornecido|exemplo|seu telefone|seu endereço|seu endereco)\b)/i;
const WEAK_COPY = /^(?:bem[- ]?vindo|conheça|descubra|aproveite|saiba mais|qualidade que|sabor que|uma experiência|experiência única|o melhor para você|feito para você|não perca)(?:\b|[!.:]|$)/i;

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
  return trimAtWord(cleaned, dense ? 1300 : 190);
}

function sanitizePromptImage(value: unknown) {
  return compactWhitespace(String(value ?? ""))
    .replace(/```/g, "")
    .replace(/\b(?:add|include|render|write|display)\s+(?:the\s+)?(?:text|title|headline|words?|letters?|logo|price|phone|watermark)[^.;]*[.;]?/gi, "")
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
    if (WEAK_COPY.test(slide.titulo)) warnings.push(`slide ${slide.numero} com título genérico`);
  });
  return warnings;
}

export const generateInstagramContent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<CarrosselOut> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no servidor.");

    const sb = admin();
    const keyRow = await requireAccessKey(sb, data.accessKey);
    const keyId = keyRow.id;

    const { data: existing } = await sb
      .from("generations")
      .select("id, titulo, legenda, hashtags, slides")
      .eq("access_key_id", keyId)
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

    const brand = brandMatch?.[1]?.trim() || "marca do cliente";
    const product = productMatch?.[1]?.trim() || data.tema;
    const visualStyle = styleMatch?.[1]?.trim() || "publicidade premium, composição editorial forte, visual de campanha autoral";
    const palette = paletteMatch?.[1]?.trim() || "paleta coerente com a marca, alto contraste";
    const requestedCta = ctaMatch?.[1]?.trim() || "";
    const denseContentMode = /card[aá]pio|menu|cat[aá]logo|lista|tabela|pre[cç]o|sabores|pizzas|bebidas|tradicionais|doces|promo[cç][aã]o/.test(
      `${data.tema} ${data.informacoesAdicionais} ${product}`.toLowerCase(),
    );

    const slideRoles = Array.from({ length: data.quantidadeSlides }, (_, index) => {
      if (index == 0) return `Slide 1: CAPA — interromper o scroll, apresentar a promessa principal e estabelecer a identidade visual.`;
      if (index == data.quantidadeSlides - 1) return `Slide ${index + 1}: CTA — concluir a narrativa, reforçar a oferta e indicar uma ação clara.`;
      if (data.objetivo.toLowerCase().includes("vender")) {
        return `Slide ${index + 1}: VENDA — apresentar benefício, produto, prova, oferta, diferencial, preço ou condição de compra sem repetir o slide anterior.`;
      }
      return `Slide ${index + 1}: CONTEÚDO — desenvolver uma ideia específica, útil e visualmente distinta, mantendo continuidade de campanha.`;
    }).join("\n");

    const systemPrompt = `Você é um diretor de criação e copywriter sênior de campanhas para Instagram. Crie conteúdo que pareça escrito para ESTA marca e ESTE pedido, não um texto genérico reutilizável. O resultado será aplicado diretamente em uma arte profissional; por isso, toda frase precisa ser útil, específica, curta e visualmente legível.

Retorne SOMENTE JSON válido, sem cercas de código, no formato EXATO:
{
  "titulo": "Título principal do carrossel",
  "legenda": "Legenda completa para Instagram, com quebras de linha e CTA no final",
  "hashtags": ["hashtag1", "hashtag2"],
  "slides": [
    {
      "numero": 1,
      "titulo": "Texto principal do slide",
      "texto": "Texto secundário do slide",
      "promptImagem": "Direção de arte em inglês, somente para a imagem sem texto",
      "tipo": "capa"
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

REGRAS DE COPY — PRIORIDADE MÁXIMA:
- Escreva em português brasileiro natural, correto e contemporâneo.
- Títulos: de 2 a 8 palavras, preferencialmente até 55 caracteres. Varie a construção sintática entre os slides.
- Texto secundário padrão: 1 a 3 frases curtas, com aproximadamente 60 a 180 caracteres no total.
- Para cardápio, catálogo, lista ou preços realmente fornecidos, organize o texto em linhas simples e legíveis. Não use Markdown, #, **, tabelas ou blocos de código.
- PROIBIDO usar placeholders ou campos fictícios, como “[inserir endereço]”, “[telefone]”, “a definir”, “não informado” ou “seu contato”. Quando um dado não foi fornecido, simplesmente não o mencione.
- PROIBIDO inventar preço, desconto, sabor, ingrediente, número, endereço, telefone, data, depoimento, resultado, garantia ou condição comercial.
- PROIBIDO escrever títulos vazios ou clichês como “Bem-vindo”, “Conheça”, “Descubra”, “Aproveite”, “Saiba mais”, “Qualidade que você merece”, “Sabor que conquista”, “Experiência única” e variações, salvo quando a frase receber informação específica que a torne indispensável.
- Não use linguagem de bastidor (“neste slide”, “o objetivo é”, “a marca deve”). Escreva somente a copy que aparecerá ao público.
- Não repita palavras-chave em todos os títulos. Não comece vários slides do mesmo jeito.
- Se o briefing tiver poucos dados, trabalhe com posicionamento e benefícios plausíveis da categoria, sem fingir fatos específicos sobre a empresa.
- Hashtags: 8 a 15, relevantes, sem # no JSON e sem termos aleatórios.

PADRÃO DE QUALIDADE VISUAL:
- Pense como diretor de arte de uma campanha real. Cada slide precisa ter um conceito visual deliberado, não apenas “uma foto bonita”.
- O produto, serviço ou assunto deve ser o herói. Evite cenas genéricas de escritório, restaurante, cidade ou pessoas sorrindo sem função narrativa.
- Não faça todos os slides com o mesmo enquadramento. Preserve a assinatura visual da campanha, mas varie câmera, distância, perspectiva e posição do assunto.
- Em alimentação, use fotografia gastronômica de campanha: produto dominante, textura real, luz controlada, profundidade e cores naturais dos ingredientes. Não aplique filtro laranja ou bege global.
- Em tecnologia, use key visual de lançamento com materiais precisos, luz escultural, composição limpa e sofisticada; evite hologramas e circuitos clichês sem motivo.
- Em automotivo, preserve proporções e use linguagem de campanha automotiva, não foto comum de concessionária.
- A paleta da marca deve aparecer como acentos controlados, nunca como banho monocromático sobre toda a imagem.

REGRAS DO promptImagem:
- Escreva em inglês, com direção de arte específica.
- Descreva SOMENTE o visual principal: hero subject, environment, camera, lens, lighting, materials, depth, color treatment and composition.
- Indique claramente o herói, posição no quadro, luz, distância/ângulo de câmera, textura/material e estética de campanha.
- NÃO solicite texto, tipografia, letras, números, logotipo, preço, telefone, watermark, UI, moldura ou palavras dentro da imagem.
- Reserve negative space natural para a copy; não crie painel branco vazio ou cartão artificial.
- Use cores locais naturais e acentos controlados da marca.
- Evite stock photo, generic modern interior, generic smiling person, objetos duplicados, mãos deformadas e fundos poluídos.
- Em alimentação ou produto físico, faça o produto ocupar cerca de 35–55% da cena quando adequado.

Antes de responder, revise silenciosamente cada slide e elimine: clichês, repetição, placeholders, dados inventados, Markdown e frases que poderiam servir para qualquer empresa.`;

    const userPrompt = `Crie o carrossel completo usando apenas os dados abaixo.

BRIEFING AUTORIZADO:
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

Faça uma campanha contínua e específica. Não use saudações de abertura, texto de apresentação genérico, placeholders ou dados que não estejam no briefing. O promptImagem de cada slide deve gerar somente a fotografia/ilustração principal sem texto.
${denseContentMode ? "MODO DENSO: use conteúdo mais completo apenas quando os itens e dados estiverem presentes no briefing. Organize em linhas simples, sem Markdown." : "MODO PADRÃO: mantenha a copy enxuta, forte e com informação real em todos os slides."}
Semente de variação criativa: ${Math.random().toString(36).slice(2)}-${Date.now()}`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 6500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") throw new Error("Tempo esgotado ao gerar. Tente novamente.");
      throw new Error("Falha ao chamar a Groq API.");
    } finally { clearTimeout(t); }

    if (!response.ok) {
      const body = await response.text();
      console.error("Groq error", response.status, body.slice(0, 500));
      if (response.status === 429) throw new Error("Limite da Groq API atingido. Tente novamente em instantes.");
      if (response.status === 401 || response.status === 403) throw new Error("Chave da Groq inválida ou sem permissão.");
      throw new Error("A Groq retornou um erro. Tente novamente.");
    }

    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("Resposta vazia da Groq.");
    const parsed = parseJsonObject(raw);

    if (
      !parsed || typeof parsed.titulo !== "string" || typeof parsed.legenda !== "string" ||
      !Array.isArray(parsed.hashtags) || !Array.isArray(parsed.slides) || parsed.slides.length === 0
    ) throw new Error("Resposta da Groq não segue o formato esperado.");

    const slides = parsed.slides.slice(0, data.quantidadeSlides).map((s, i) => ({
      numero: i + 1,
      titulo: sanitizeTitle(s.titulo),
      texto: sanitizeBody(s.texto, denseContentMode),
      promptImagem: sanitizePromptImage(s.promptImagem),
      tipo: String(s.tipo ?? (i === 0 ? "capa" : i === data.quantidadeSlides - 1 ? "cta" : "conteudo")),
    }));

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

    const { data: inserted, error: insErr } = await sb
      .from("generations")
      .insert({
        access_key_id: keyId,
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


    return { id: inserted.id, titulo: carouselTitle, legenda: caption, hashtags, slides };
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
    const keyRow = await requireAccessKey(sb, data.accessKey);
    const { data: row, error } = await sb
      .from("generations")
      .select("slides")
      .eq("id", data.generationId)
      .eq("access_key_id", keyRow.id)
      .single();
    if (error || !row) throw new Error("Geração não encontrada.");
    const slides = (row.slides as unknown as SlideOut[]).map(s =>
      s.numero === data.slideNumero ? { ...s, titulo: data.titulo, texto: data.texto } : s,
    );
    const { error: upErr } = await sb
      .from("generations")
      .update({ slides: slides as unknown as never })
      .eq("id", data.generationId)
      .eq("access_key_id", keyRow.id);
    if (upErr) throw new Error("Falha ao salvar edições.");
    return { ok: true };
  });

export const testGroqConnection = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; model: string; message: string }> => {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
    if (!apiKey) return { ok: false, model, message: "GROQ_API_KEY não configurada no servidor." };
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 10,
          messages: [{ role: "user", content: "Responda apenas: OK" }],
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        if (r.status === 401 || r.status === 403) return { ok: false, model, message: "Chave da Groq inválida ou sem permissão." };
        if (r.status === 429) return { ok: false, model, message: "Limite da Groq atingido no momento." };
        return { ok: false, model, message: `Erro Groq ${r.status}: ${body.slice(0, 160)}` };
      }
      const j = await r.json() as { choices?: { message?: { content?: string } }[] };
      const txt = j.choices?.[0]?.message?.content?.trim() ?? "";
      return { ok: true, model, message: `Conexão OK. Resposta: "${txt || "(vazia)"}"` };
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") return { ok: false, model, message: "Tempo esgotado ao contatar a Groq." };
      return { ok: false, model, message: "Falha de rede ao contatar a Groq." };
    } finally { clearTimeout(t); }
  });

const PromptCreatorInput = z.object({
  accessKey: z.string().trim().min(4).max(64),
  pedido: z.string().trim().min(3).max(500),
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
    prompt: String(value.prompt || "").trim().slice(0, 500),
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

export const generateCarouselPrompt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PromptCreatorInput.parse(d))
  .handler(async ({ data }): Promise<CarouselPromptData> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no servidor.");

    const sb = admin();
    await requireAccessKey(sb, data.accessKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
          temperature: 0.45,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Transforme o pedido em dados para um carrossel profissional de Instagram. Retorne SOMENTE JSON válido com as chaves: prompt, tema, empresa, produto, objetivo, publicoAlvo, tom, quantidadeSlides, estilo, paleta, cta, informacoesAdicionais. O campo prompt deve ter no máximo 500 caracteres e resumir tudo de forma clara. objetivo deve ser um destes: vender, educar, engajar, informar, captar clientes. quantidadeSlides deve ser um número entre 1 e 20, normalmente 5. Não invente nome de empresa, preço, telefone, endereço ou informação comercial. Quando o usuário não informar algo, use string vazia, exceto tom, estilo, paleta e quantidadeSlides, que podem receber padrões coerentes.`,
            },
            { role: "user", content: data.pedido },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) throw new Error("Limite da Groq atingido. Tente novamente em instantes.");
        if (response.status === 401 || response.status === 403) throw new Error("Chave da Groq inválida ou sem permissão.");
        throw new Error("A Groq não conseguiu criar o prompt.");
      }

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
      if (!normalized.prompt) normalized.prompt = data.pedido.slice(0, 500);
      if (!normalized.tema) normalized.tema = normalized.prompt;
      return normalized;
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error("Tempo esgotado ao criar o prompt. Tente novamente.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
