import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------------------------------------------------------------------------
// TEXTO — Groq, exclusivamente via API REST oficial (chat completions,
// formato compatível com OpenAI). Nunca usar Gemini/Google aqui.
// ---------------------------------------------------------------------------

const GROQ_TEXT_TIMEOUT_MS = 45_000;

interface SlideOut {
  title: string;
  body: string;
  imagePrompt: string;
}

async function callChat(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada no servidor.");

  const model = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TEXT_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Groq error", response.status, body.slice(0, 500));
      if (response.status === 429) throw new Error("Limite da Groq API atingido. Tente novamente em instantes.");
      if (response.status === 401 || response.status === 403) throw new Error("Chave da Groq inválida ou sem permissão.");
      throw new Error(`A Groq retornou um erro (${response.status}). Tente novamente.`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const output = json.choices?.[0]?.message?.content?.trim();
    if (!output) throw new Error("Resposta vazia da Groq.");
    return output;
  } catch (error) {
    const err = error as Error;
    if (err.name === "AbortError") throw new Error("Tempo esgotado ao chamar a Groq. Tente novamente.");
    if (err.message?.startsWith("A Groq") || err.message?.includes("Groq")) throw err;
    throw new Error(`Falha ao chamar a Groq: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

const CarrosselInput = z.object({
  theme: z.string().min(1),
  reference: z.string().optional().default(""),
  style: z.string().optional().default(""),
  slides: z.number().int().min(1).max(20),
  extra: z.string().optional().default(""),
  seed: z.string().optional().default(""),
});

export const generateCarrossel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CarrosselInput.parse(d))
  .handler(async ({ data }): Promise<{ slides: SlideOut[] }> => {
    const sys = `Você é um redator especialista em Instagram. Retorne SEMPRE JSON válido no formato:
{ "slides": [ { "title": "...", "body": "...", "imagePrompt": "..." }, ... ] }
Regras: títulos curtos e impactantes, corpo em 1-2 linhas, imagePrompt em inglês descritivo com variações de ângulo/composição/iluminação únicas para cada slide (nunca repita a mesma composição). Idioma dos textos: português.`;
    const user = `Tema: ${data.theme}
Referência de estilo (só direção, não copiar): ${data.reference}
Estilo visual desejado: ${data.style}
Quantidade de slides: ${data.slides}
Instruções extras: ${data.extra}
Aleatoriedade (seed ${data.seed}): varie tom, exemplos e enquadramentos.`;

    const raw = await callChat([{ role: "system", content: sys }, { role: "user", content: user }]);
    let parsed: { slides: SlideOut[] };
    try { parsed = JSON.parse(raw); } catch { throw new Error("Resposta da IA inválida"); }
    if (!Array.isArray(parsed.slides)) throw new Error("Resposta sem slides");
    return { slides: parsed.slides.slice(0, data.slides) };
  });

const CartazInput = z.object({
  title: z.string(),
  date: z.string().optional().default(""),
  time: z.string().optional().default(""),
  place: z.string().optional().default(""),
  kind: z.string().optional().default(""),
  style: z.string().optional().default(""),
  extra: z.string().optional().default(""),
  seed: z.string().optional().default(""),
});

export const generateCartaz = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CartazInput.parse(d))
  .handler(async ({ data }): Promise<SlideOut> => {
    const CARTAZ_METAPHORS = [
      "a classical marble statue with its head replaced by a glowing lightbulb, floating dust particles, dramatic surreal studio light",
      "a giant hand made of liquid chrome reaching out of a tiny doorway, impossible scale, dramatic shadows",
      "an hourglass where falling sand turns into a flock of birds mid-fall, cinematic dramatic light",
      "a door standing alone in an open field, opening into a galaxy instead of a room, surreal contrast",
      "a megaphone made of cracked stone with sound waves visualized as shattering glass shards frozen in air",
      "a staircase folding into an impossible Escher-like loop, one figure walking upward into the sky",
      "a mirror reflecting a completely different scene than what's in front of it, surreal juxtaposition",
      "a birdcage made of light rays, wide open, glowing particles escaping upward, dark surreal background",
    ];
    const metaphor = CARTAZ_METAPHORS[Math.floor(Math.random() * CARTAZ_METAPHORS.length)];

    const sys = `Você cria cartazes de eventos SURREAIS e chamativos para Instagram, no nível de campanhas premiadas — nunca foto de banco de imagens genérica ("pessoas sorrindo", "mesa de escritório"). Retorne JSON: { "title": "...", "body": "...", "imagePrompt": "..." }. Body inclui data, hora e local formatados.
imagePrompt sempre em inglês: parta OBRIGATORIAMENTE desta direção visual surreal e adapte-a ao tema/tipo do evento como elemento central: "${metaphor}". Escreva como still cinematográfico completo (iluminação, composição, cores), mantendo o caráter surreal.`;
    const user = `Evento: ${data.title}
Tipo: ${data.kind}
Data: ${data.date} ${data.time}
Local: ${data.place}
Estilo: ${data.style}
Extras: ${data.extra}
Seed única: ${data.seed}-${Math.random().toString(36).slice(2)}`;
    const raw = await callChat([{ role: "system", content: sys }, { role: "user", content: user }]);
    return JSON.parse(raw) as SlideOut;
  });


// ---------------------------------------------------------------------------
// IMAGEM — Cloudflare Workers AI, exclusivamente.
// Modelo: @cf/black-forest-labs/flux-1-schnell, chamado via fetch() puro
// (sem SDK da Cloudflare). Nunca usar Gemini/Google para gerar imagens aqui.
// ---------------------------------------------------------------------------

const CF_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const CF_IMAGE_TIMEOUT_MS = 60_000;

const ImageInput = z.object({
  prompt: z.string().min(1),
  seed: z.string().optional().default(""),
  slideTitle: z.string().optional().default(""),
  slideBody: z.string().optional().default(""),
  slideIndex: z.number().optional().default(0),
  slideTotal: z.number().optional().default(0),
  slideKind: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  palette: z.string().optional().default(""),
  style: z.string().optional().default(""),
});

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN não configuradas no servidor.");
    }

    // IMPORTANTE: nunca pedimos ao modelo de imagem para renderizar texto.
    // Modelos rápidos (flux-1-schnell) erram a ortografia e tendem a alucinar
    // molduras/cards de "slide X de Y". O texto é sempre composto depois,
    // no cliente, via Canvas (ver src/lib/composePost.ts) — 100% fiel ao
    // português e sem nenhuma borda/moldura indesejada.
    const fullPrompt = `${data.prompt}.
Professional advertising / editorial photograph, full-bleed, edge to edge, shot for a real campaign.
Visual style: ${data.style || "cinematic, rich contrast, realistic textures"}.
Color palette mood: ${data.palette || "cohesive and high-contrast"}.

STRICT RULES:
- Pure photography only. Absolutely NO text, letters, words, numbers, logos or watermarks anywhere in the image.
- NO card, frame, border, slide badge, pagination indicator, UI element, or mockup of any kind.
- The photograph must fill the entire frame edge to edge.

Unique variation seed: ${data.seed}.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CF_IMAGE_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_IMAGE_MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            prompt: fullPrompt,
            // 1-8 passos; flux-1-schnell é o modelo "rápido" da Flux, 8 dá mais qualidade
            // mantendo latência baixa. Ajuste se quiser priorizar velocidade (ex: 4).
            steps: 8,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        console.error("Cloudflare Workers AI error", response.status, body.slice(0, 500));
        if (response.status === 429) throw new Error("Limite da Cloudflare Workers AI atingido. Tente novamente em instantes.");
        if (response.status === 401 || response.status === 403) throw new Error("Token da Cloudflare inválido ou sem permissão para gerar imagens.");
        throw new Error(`Cloudflare Workers AI retornou um erro (${response.status}). Tente novamente.`);
      }

      const contentType = response.headers.get("content-type") || "";

      // A REST API do Workers AI para flux-1-schnell responde JSON com a imagem em base64.
      if (contentType.includes("application/json")) {
        const json = (await response.json()) as {
          result?: { image?: string };
          success?: boolean;
          errors?: { message: string }[];
        };
        const base64 = json.result?.image;
        if (!base64) {
          const errMsg = json.errors?.[0]?.message || "Imagem não retornada pela Cloudflare Workers AI.";
          throw new Error(errMsg);
        }
        return { dataUrl: `data:image/png;base64,${base64}` };
      }

      // Fallback defensivo: caso a resposta venha como bytes binários diretos.
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return { dataUrl: `data:image/png;base64,${base64}` };
    } catch (error) {
      const err = error as Error;
      if (err.name === "AbortError") throw new Error("Tempo esgotado ao gerar imagem na Cloudflare Workers AI.");
      if (err.message?.includes("Cloudflare")) throw err;
      throw new Error(`Falha ao gerar imagem: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }
  });
