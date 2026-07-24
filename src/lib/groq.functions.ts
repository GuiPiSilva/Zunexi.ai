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
  informacoesAdicionais: z.string().trim().max(1000).optional().default(""),
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
    const visualStyle = styleMatch?.[1]?.trim() || "publicidade premium, composição editorial forte";
    const palette = paletteMatch?.[1]?.trim() || "paleta coerente com a marca, alto contraste";
    const requestedCta = ctaMatch?.[1]?.trim() || "";

    const slideRoles = Array.from({ length: data.quantidadeSlides }, (_, index) => {
      if (index == 0) return `Slide 1: CAPA — interromper o scroll, apresentar a promessa principal e estabelecer a identidade visual.`;
      if (index == data.quantidadeSlides - 1) return `Slide ${index + 1}: CTA — concluir a narrativa, reforçar a oferta e indicar uma ação clara.`;
      if (data.objetivo.toLowerCase().includes("vender")) {
        return `Slide ${index + 1}: VENDA — apresentar benefício, produto, prova, oferta, diferencial, preço ou condição de compra sem repetir o slide anterior.`;
      }
      return `Slide ${index + 1}: CONTEÚDO — desenvolver uma ideia específica, útil e visualmente distinta, mantendo continuidade de campanha.`;
    }).join("\n");

    const systemPrompt = `Você é diretor de criação, designer de campanhas para Instagram e copywriter de resposta direta. Sua tarefa não é criar apenas um roteiro: você deve planejar um CARROSSEL VISUALMENTE PRONTO, com qualidade de agência, consistência de marca e composição semelhante a anúncios profissionais de alimentação, varejo, tecnologia e serviços.

Retorne SEMPRE JSON válido, sem markdown, no formato EXATO:
{
  "titulo": "Título principal do carrossel",
  "legenda": "Legenda completa para Instagram, com quebras de linha e CTA no final",
  "hashtags": ["hashtag1", "hashtag2"],
  "slides": [
    {
      "numero": 1,
      "titulo": "Texto principal que aparecerá no layout",
      "texto": "Texto secundário curto que aparecerá no layout",
      "promptImagem": "Direção de arte completa em inglês para gerar o post final já diagramado",
      "tipo": "capa"
    }
  ]
}

PLANEJAMENTO OBRIGATÓRIO:
${slideRoles}

PADRÃO DE QUALIDADE VISUAL:
- Cada slide deve parecer uma peça publicitária finalizada, não uma foto solta com texto simples por cima.
- Planeje hierarquia tipográfica forte, grid, margens, blocos, selos, linhas, ícones, chamadas, etiquetas, preços e elementos de apoio quando fizerem sentido.
- Use fotografia de produto extremamente apetitosa ou premium quando o tema envolver alimentos/produtos; use mockups, interfaces, objetos e cenas coerentes quando for serviço ou tecnologia.
- Preserve uma identidade visual única em todos os slides: mesma paleta, textura, linguagem tipográfica, tratamento fotográfico e assinatura da marca.
- Varie a composição entre slides: capa hero, produto + benefício, comparação, lista, cardápio, oferta, prova e CTA. Não repita o mesmo enquadramento.
- Não use metáforas surreais aleatórias quando elas não combinarem com o negócio. A direção visual deve nascer do produto, do nicho e do objetivo.
- Não invente telefone, preço, endereço, desconto, data ou condição comercial. Use somente dados fornecidos; quando não houver, não inclua.

REGRAS DE COPY:
- Português brasileiro correto, natural e persuasivo.
- Título entre 2 e 8 palavras, legível e forte.
- Texto secundário curto: no máximo 22 palavras, salvo cardápios/listas solicitados pelo usuário.
- O primeiro slide é "capa", os intermediários são "conteudo" e o último é "cta".
- Hashtags entre 8 e 15, sem # dentro do JSON.

REGRAS DO promptImagem:
- Escreva em inglês, mas declare EXATAMENTE quais textos em português devem aparecer na arte.
- Descreva o POST FINAL COMPLETO em formato quadrado 1:1: layout, posição dos textos, produto, fundo, iluminação, fontes, contraste, textura e elementos gráficos.
- Inclua literalmente: Main headline text: "..." e Supporting text: "..." usando o título e texto do slide.
- Quando a marca for conhecida, inclua Brand name: "..." em posição discreta e consistente.
- Exija spelling perfeito em português e proíba qualquer texto extra inventado.
- Priorize legibilidade em tela de celular e acabamento editorial premium.
- O prompt não deve pedir fotografia sem texto; ele deve pedir a peça diagramada pronta para Instagram.`;

    const userPrompt = `Crie o carrossel completo com estes dados:
Tema: ${data.tema}
Marca: ${brand}
Produto ou serviço: ${product}
Objetivo: ${data.objetivo || "engajamento"}
Público-alvo: ${data.publicoAlvo || "geral"}
Tom de comunicação: ${data.tom}
Quantidade de slides: ${data.quantidadeSlides}
Estilo visual: ${visualStyle}
Paleta: ${palette}
CTA fornecido: ${requestedCta || "nenhum CTA específico"}
Informações adicionais completas: ${data.informacoesAdicionais || "nenhuma"}

Faça os slides funcionarem como uma campanha contínua. O promptImagem de cada slide deve gerar a arte final diagramada, com textos visíveis, identidade da marca e qualidade comercial alta. Não invente dados ausentes.
Semente de variação: ${Math.random().toString(36).slice(2)}-${Date.now()}`;

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
          temperature: 0.9,
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
    let parsed: Omit<CarrosselOut, "id">;
    try { parsed = JSON.parse(raw) as Omit<CarrosselOut, "id">; }
    catch { throw new Error("Resposta da Groq em formato inválido."); }

    if (
      !parsed || typeof parsed.titulo !== "string" || typeof parsed.legenda !== "string" ||
      !Array.isArray(parsed.hashtags) || !Array.isArray(parsed.slides) || parsed.slides.length === 0
    ) throw new Error("Resposta da Groq não segue o formato esperado.");

    const slides = parsed.slides.slice(0, data.quantidadeSlides).map((s, i) => ({
      numero: i + 1,
      titulo: String(s.titulo ?? ""),
      texto: String(s.texto ?? ""),
      promptImagem: String(s.promptImagem ?? ""),
      tipo: String(s.tipo ?? (i === 0 ? "capa" : i === parsed.slides.length - 1 ? "cta" : "conteudo")),
    }));
    const hashtags = parsed.hashtags.map(h => String(h).replace(/^#/, "")).slice(0, 20);

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
        titulo: parsed.titulo,
        legenda: parsed.legenda,
        hashtags,
        slides,
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error("Falha ao salvar geração no banco.");


    return { id: inserted.id, titulo: parsed.titulo, legenda: parsed.legenda, hashtags, slides };
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
    estilo: String(value.estilo || "moderno e tecnológico").trim() || "moderno e tecnológico",
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
