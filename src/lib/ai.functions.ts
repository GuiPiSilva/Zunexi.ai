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
// IMAGEM — Kie.ai + Nano Banana.
// A chave fica exclusivamente no servidor. A API da Kie cria tarefas de forma
// assíncrona; por isso o servidor cria a tarefa, consulta o status e converte
// a imagem final em data URL para manter compatibilidade com o front-end.
// ---------------------------------------------------------------------------

const KIE_API_BASE_URL = "https://api.kie.ai";
const KIE_IMAGE_MODEL = process.env.KIE_IMAGE_MODEL || "google/nano-banana";
const KIE_IMAGE_TIMEOUT_MS = Number(process.env.KIE_IMAGE_TIMEOUT_MS || 180_000);
const KIE_POLL_INITIAL_MS = 2_500;
const KIE_POLL_MAX_MS = 8_000;

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

type KieCreateResponse = {
  code?: number;
  msg?: string;
  data?: { taskId?: string };
};

type KieTaskResponse = {
  code?: number;
  msg?: string;
  data?: {
    state?: "waiting" | "queuing" | "generating" | "success" | "fail" | string;
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function kieErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) return "Chave da Kie.ai inválida ou sem permissão.";
  if (status === 402) return "Sua conta Kie.ai está sem créditos suficientes.";
  if (status === 429) return "Limite de requisições da Kie.ai atingido. Tente novamente em instantes.";
  return `A Kie.ai retornou um erro (${status}): ${body.slice(0, 180)}`;
}

async function createKieImageTask(apiKey: string, prompt: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${KIE_API_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: KIE_IMAGE_MODEL,
      input: {
        prompt,
        output_format: "png",
        aspect_ratio: "4:5",
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(kieErrorMessage(response.status, body));

  let json: KieCreateResponse;
  try {
    json = JSON.parse(body) as KieCreateResponse;
  } catch {
    throw new Error("Resposta inválida ao criar tarefa na Kie.ai.");
  }

  const taskId = json.data?.taskId;
  if (!taskId || (json.code && json.code !== 200)) {
    throw new Error(json.msg || "A Kie.ai não retornou o identificador da tarefa.");
  }
  return taskId;
}

async function waitForKieImage(apiKey: string, taskId: string, signal: AbortSignal): Promise<string> {
  let delay = KIE_POLL_INITIAL_MS;

  while (!signal.aborted) {
    await sleep(delay);
    const response = await fetch(
      `${KIE_API_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      },
    );

    const body = await response.text();
    if (!response.ok) throw new Error(kieErrorMessage(response.status, body));

    let json: KieTaskResponse;
    try {
      json = JSON.parse(body) as KieTaskResponse;
    } catch {
      throw new Error("Resposta inválida ao consultar tarefa na Kie.ai.");
    }

    const state = json.data?.state;
    if (state === "fail") {
      throw new Error(json.data?.failMsg || json.msg || "A geração de imagem falhou na Kie.ai.");
    }

    if (state === "success") {
      let result: { resultUrls?: string[] } = {};
      try {
        result = JSON.parse(json.data?.resultJson || "{}") as { resultUrls?: string[] };
      } catch {
        throw new Error("A Kie.ai concluiu a tarefa, mas retornou um resultado inválido.");
      }
      const imageUrl = result.resultUrls?.[0];
      if (!imageUrl) throw new Error("A Kie.ai não retornou a URL da imagem gerada.");
      return imageUrl;
    }

    delay = Math.min(Math.round(delay * 1.4), KIE_POLL_MAX_MS);
  }

  throw new DOMException("Aborted", "AbortError");
}

async function imageUrlToDataUrl(imageUrl: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) throw new Error(`Não foi possível baixar a imagem gerada (${response.status}).`);
  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    const apiKey = process.env.KIE_API_KEY?.trim();
    if (!apiKey) throw new Error("KIE_API_KEY não configurada no servidor.");

    const fullPrompt = `${data.prompt}.
Professional advertising / editorial photograph, full-bleed, edge to edge, shot for a real campaign, high production value.
Visual style: ${data.style || "cinematic, rich contrast, realistic textures"}.
Color palette mood: ${data.palette || "cohesive and high-contrast"}.
Aspect ratio: portrait, 4:5.

STRICT RULES:
- Pure photography/illustration only. Absolutely NO text, letters, words, numbers, logos or watermarks anywhere in the image.
- NO card, frame, border, slide badge, pagination indicator, UI element, or mockup of any kind.
- The image must fill the entire frame edge to edge.

Unique variation seed: ${data.seed}.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KIE_IMAGE_TIMEOUT_MS);

    try {
      const taskId = await createKieImageTask(apiKey, fullPrompt, controller.signal);
      const imageUrl = await waitForKieImage(apiKey, taskId, controller.signal);
      const dataUrl = await imageUrlToDataUrl(imageUrl, controller.signal);
      return { dataUrl };
    } catch (error) {
      const err = error as Error;
      if (err.name === "AbortError") throw new Error("Tempo esgotado ao gerar imagem na Kie.ai.");
      if (err.message?.includes("Kie.ai") || err.message?.includes("imagem")) throw err;
      throw new Error(`Falha ao gerar imagem pela Kie.ai: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }
  });
