import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function admin() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}



const Input = z.object({
  accessKey: z.string().trim().min(4).max(64),
  tema: z.string().trim().min(3).max(500),
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

const MAX_PER_DAY = 30;
const TIMEOUT_MS = 45_000;

async function requireKey(sb: ReturnType<typeof admin>, key: string) {
  const { data: row } = await sb.from("access_keys")
    .select("id, active").eq("key", key).maybeSingle();
  if (!row || !row.active) throw new Error("Chave de acesso inválida ou desativada. Peça uma nova ao admin.");
  return row.id as string;
}

export const generateInstagramContent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<CarrosselOut> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no servidor.");

    const sb = admin();
    const keyId = await requireKey(sb, data.accessKey);

    // Rate limit por chave
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await sb
      .from("generations")
      .select("id", { count: "exact", head: true })
      .eq("access_key_id", keyId)
      .gte("created_at", sinceIso);
    if (countErr) throw new Error("Falha ao verificar limite de uso.");
    if ((count ?? 0) >= MAX_PER_DAY) {
      throw new Error(`Limite diário atingido (${MAX_PER_DAY} gerações) para esta chave.`);
    }

    const TEXT_FORMATS = [
      "palavra-bomba: 1 a 3 palavras GIGANTES dominando o slide, complemento curto",
      "pergunta/quiz: provoca o leitor com uma pergunta direta ou de múltipla escolha",
      "checklist numerada: 3 a 5 itens curtíssimos com marcador",
      "afirmação de contraste: duas ideias opostas lado a lado (ex: 'X sai caro, Y sai grátis')",
      "estatística/dado: um número grande como protagonista da frase",
      "citação/mantra: frase curta e definitiva, tom de manifesto",
      "antes/depois: contraste direto entre dois estados",
      "mito vs verdade: desmonta uma crença comum em uma frase",
    ];

    const VISUAL_METAPHORS = [
      "a classical marble statue but its head is replaced by a glowing lightbulb, floating fragments, surreal studio lighting",
      "a giant human hand made of liquid chrome reaching out of a tiny smartphone screen, impossible scale, dramatic shadows",
      "a chessboard floating in a void, one piece dissolving into golden dust mid-air, dreamlike gravity-defying composition",
      "a human silhouette made entirely of static TV noise / glitch particles, standing in an empty vast space",
      "a birdcage made of light rays, wide open, a swarm of glowing particles escaping upward, dark surreal background",
      "an astronaut helmet reflecting a tiny office desk inside the visor, floating in a starless void",
      "a megaphone made of cracked stone, sound waves visualized as shattering glass shards frozen in air",
      "a person's head opening like a drawer, gears and light spilling out, surreal double-exposure style",
      "a giant magnifying glass hovering over a miniature city made of paper, dramatic top-down lighting",
      "a staircase that folds into an impossible Escher-like loop, one figure walking upward into the sky",
      "a hand made of tangled roots/vines holding a single glowing seed, hyper-detailed, dark moody background",
      "an hourglass where the falling sand turns into a flock of birds mid-fall, cinematic dramatic light",
      "a mirror reflecting a completely different scene than what's in front of it, surreal juxtaposition",
      "a business suit made of storm clouds and lightning, faceless figure, dramatic low-angle shot",
      "a single red thread connecting a tiny human figure to a massive floating brain, minimalist dark void",
      "a door standing alone in an open field, opening into a galaxy instead of a room, surreal contrast",
    ];

    function shuffle<T>(arr: T[]): T[] {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const shuffledFormats = shuffle(TEXT_FORMATS);
    const shuffledMetaphors = shuffle(VISUAL_METAPHORS);
    const slideBriefs = Array.from({ length: data.quantidadeSlides }, (_, i) =>
      `Slide ${i + 1}: formato de texto = "${shuffledFormats[i % shuffledFormats.length]}" | direção visual obrigatória do promptImagem = "${shuffledMetaphors[i % shuffledMetaphors.length]}"`,
    ).join("\n");

    const systemPrompt = `Você é um diretor de arte e redator publicitário especializado em conteúdo SURREAL e chamativo para Instagram — no estilo de campanhas premiadas que usam colagem digital, escala impossível, dupla exposição e metáforas visuais oníricas (não apenas fotografia bonita: algo estranho, inesperado, que trava o dedo do usuário no scroll). NUNCA gere fotos genéricas de "pessoa sorrindo no notebook", "equipe reunida numa mesa" ou still-life comum de escritório — isso é estritamente proibido.
Retorne SEMPRE JSON válido, sem markdown, no formato EXATO:
{
  "titulo": "Título principal do carrossel",
  "legenda": "Legenda completa para Instagram, com quebras de linha e CTA no final",
  "hashtags": ["hashtag1", "hashtag2"],
  "slides": [
    { "numero": 1, "titulo": "Título do slide", "texto": "Texto do slide", "promptImagem": "Descrição detalhada da imagem em inglês", "tipo": "capa" }
  ]
}

Você DEVE seguir exatamente esta escalação, um formato de texto e uma direção visual diferentes e já definidos para cada slide (não invente outro formato nem outra direção visual, apenas adapte o conteúdo do tema abaixo para caber na combinação indicada):
${slideBriefs}

Regras adicionais:
- O primeiro slide tem tipo "capa", os intermediários "conteudo", o último "cta".
- Títulos curtos e impactantes (máx 8 palavras), adaptados ao formato de texto indicado para aquele slide.
- Textos com 1-3 linhas cada.
- promptImagem sempre em inglês: pegue a direção visual obrigatória indicada para o slide e escreva-a como um still cinematográfico completo (iluminação, composição, cores), incorporando o tema/produto do usuário como elemento central da cena — sem perder o caráter surreal da direção indicada.
- Hashtags relevantes ao nicho, entre 8 e 15.
- Idioma dos textos: português brasileiro.`;

    const userPrompt = `Tema: ${data.tema}
Objetivo: ${data.objetivo || "engajamento"}
Público-alvo: ${data.publicoAlvo || "geral"}
Tom de comunicação: ${data.tom}
Quantidade de slides: ${data.quantidadeSlides}
Informações adicionais: ${data.informacoesAdicionais || "nenhuma"}
Semente de variação (use para garantir que esta geração seja diferente de qualquer geração anterior do mesmo tema): ${Math.random().toString(36).slice(2)}-${Date.now()}`;

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

    await sb.from("access_keys")
      .update({ uses: (count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", keyId);

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
    await requireKey(sb, data.accessKey);
    const { data: row, error } = await sb
      .from("generations").select("slides").eq("id", data.generationId).single();
    if (error || !row) throw new Error("Geração não encontrada.");
    const slides = (row.slides as unknown as SlideOut[]).map(s =>
      s.numero === data.slideNumero ? { ...s, titulo: data.titulo, texto: data.texto } : s,
    );
    const { error: upErr } = await sb
      .from("generations").update({ slides: slides as unknown as never }).eq("id", data.generationId);
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
