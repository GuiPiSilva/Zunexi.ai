import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, consumeAccessCredit, requireAccessKey } from "@/lib/access.functions";

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
  jobId: z.string().uuid(),
  accessKey: z.string().trim().min(4).max(64),
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
    const sb = admin();
    await requireAccessKey(sb, data.accessKey);
    await consumeAccessCredit(sb, data.accessKey, data.jobId);
    const sys = `Você é diretor de arte especializado em cartazes profissionais para Instagram. Retorne apenas JSON válido: { "title": "...", "body": "...", "imagePrompt": "..." }.

REGRAS:
- title: chamada principal curta e impactante em português.
- body: somente as informações reais fornecidas pelo usuário, organizadas de forma clara; inclua data, horário e local apenas quando existirem.
- imagePrompt: em inglês, descreva UMA ARTE FINAL COMPLETA de cartaz, já diagramada, com fotografia ou ilustração coerente com o evento, tipografia profissional, hierarquia, contraste, iluminação, textura e elementos gráficos.
- A arte deve parecer criada por uma agência, pronta para publicação, sem blocos vazios, sem mockup, sem moldura de editor e sem aparência de template simples.
- Não invente preço, telefone, endereço, atrações, datas, logotipo ou qualquer informação que não foi enviada.
- Adapte a direção visual ao tipo do evento: igreja deve ser elegante e inspiradora; música deve ser energética; palestra deve ser sofisticada; promoção deve ser comercial e clara.`;
    const user = `Evento: ${data.title}
Tipo: ${data.kind}
Data: ${data.date} ${data.time}
Local: ${data.place}
Estilo: ${data.style}
Extras: ${data.extra}
Seed única: ${data.seed}-${Math.random().toString(36).slice(2)}`;
    const raw = await callChat([{ role: "system", content: sys }, { role: "user", content: user }]);
    const output = JSON.parse(raw) as SlideOut;
    return output;
  });


// ---------------------------------------------------------------------------
// IMAGEM — Kie.ai + Nano Banana.
// A chave fica exclusivamente no servidor. A API da Kie cria tarefas de forma
// assíncrona; por isso o servidor cria a tarefa, consulta o status e converte
// a imagem final em data URL para manter compatibilidade com o front-end.
// ---------------------------------------------------------------------------

const KIE_API_BASE_URL = "https://api.kie.ai";
const KIE_IMAGE_MODEL = process.env.KIE_IMAGE_MODEL || "google/nano-banana";
const KIE_IMAGE_EDIT_MODEL = process.env.KIE_IMAGE_EDIT_MODEL || "google/nano-banana-edit";
const KIE_UPLOAD_BASE_URL = "https://kieai.redpandaai.co";
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
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).optional().default("1:1"),
  referenceImageUrl: z.string().url().optional(),
});

const ReferenceImageInput = z.object({
  dataUrl: z.string().min(20).max(15_000_000),
  fileName: z.string().trim().min(1).max(120).default("referencia.png"),
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

async function createKieImageTask(apiKey: string, prompt: string, aspectRatio: "1:1" | "4:5" | "9:16", signal: AbortSignal, referenceImageUrl?: string): Promise<string> {
  const input = referenceImageUrl
    ? { prompt, image_urls: [referenceImageUrl], output_format: "png", aspect_ratio: aspectRatio }
    : { prompt, output_format: "png", aspect_ratio: aspectRatio };

  const response = await fetch(`${KIE_API_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: referenceImageUrl ? KIE_IMAGE_EDIT_MODEL : KIE_IMAGE_MODEL,
      input,
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

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = detectImageContentType(bytes, response.headers.get("content-type"));
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function detectImageContentType(bytes: Buffer, responseType: string | null): string {
  const declaredType = responseType?.split(";", 1)[0].trim().toLowerCase();
  if (declaredType?.startsWith("image/")) return declaredType;

  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.subarray(4, 12).toString("ascii").includes("ftypavif")) return "image/avif";
  if (bytes.subarray(0, 256).toString("utf8").includes("<svg")) return "image/svg+xml";

  throw new Error("A Kie.ai retornou um arquivo que não foi reconhecido como imagem.");
}


export const uploadReferenceImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReferenceImageInput.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const apiKey = process.env.KIE_API_KEY?.trim();
    if (!apiKey) throw new Error("KIE_API_KEY não configurada no servidor.");
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(data.dataUrl)) {
      throw new Error("Envie uma imagem PNG, JPG ou WebP válida.");
    }

    const response = await fetch(`${KIE_UPLOAD_BASE_URL}/api/file-base64-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        base64Data: data.dataUrl,
        uploadPath: "images/inlabs-references",
        fileName: `${Date.now()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
      }),
    });

    const body = await response.text();
    if (!response.ok) throw new Error(kieErrorMessage(response.status, body));
    const json = JSON.parse(body) as { success?: boolean; msg?: string; data?: { downloadUrl?: string; fileUrl?: string } };
    const url = json.data?.downloadUrl || json.data?.fileUrl;
    if (!json.success || !url) throw new Error(json.msg || "Não foi possível enviar a imagem de referência.");
    return { url };
  });

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }): Promise<{ dataUrl: string; url: string }> => {
    const apiKey = process.env.KIE_API_KEY?.trim();
    if (!apiKey) throw new Error("KIE_API_KEY não configurada no servidor.");

    const title = data.slideTitle.trim();
    const body = data.slideBody.trim();
    const brand = data.brand.trim();

    const fullPrompt = `${data.prompt}

CREATE THE FINAL, FULLY DESIGNED INSTAGRAM ARTWORK — not a background photo, not a blank template and not a mockup.
Canvas aspect ratio: ${data.aspectRatio}. Full bleed, premium advertising finish.
Slide role: ${data.slideKind || "content"}. Slide ${data.slideIndex || 1} of ${data.slideTotal || 1}.
Brand: ${brand || "use only the brand information explicitly present in the art direction"}.
Visual style: ${data.style || "premium commercial art direction, bold editorial hierarchy"}.
Color palette: ${data.palette || "cohesive, branded and high contrast"}.

MANDATORY TEXT TO RENDER EXACTLY IN PORTUGUESE:
Main headline: "${title}"
Supporting text: "${body}"

DESIGN REQUIREMENTS:
- Render the exact supplied Portuguese text with correct spelling, accents and punctuation.
- Strong professional typography hierarchy, intentional grid, safe margins and excellent mobile readability.
- Build a complete campaign layout with product photography/illustration, graphic shapes, lines, badges, icons, dividers or labels only when relevant.
- Make the product or core subject the visual hero. Use realistic textures, premium lighting and commercial retouching.
- Make it look like a finished professional poster or campaign artwork, not a generic AI image and not an editable template preview.
- Do not add any invented words, prices, phone numbers, dates, handles, logos or claims.
- Do not add slide counters, watermarks, mockup frames, UI chrome or meaningless decorative text.
- Every element must look intentionally designed and production-ready.

${data.referenceImageUrl ? `REFERENCE IMAGE INSTRUCTIONS:
- Use the uploaded image as the main visual reference for subject, product, logo, colors or composition.
- Preserve recognizable brand/product characteristics when present.
- Integrate it naturally into the final campaign artwork instead of merely placing it unchanged on the canvas.` : ""}

Unique variation seed: ${data.seed}.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KIE_IMAGE_TIMEOUT_MS);

    try {
      const taskId = await createKieImageTask(apiKey, fullPrompt, data.aspectRatio, controller.signal, data.referenceImageUrl);
      const imageUrl = await waitForKieImage(apiKey, taskId, controller.signal);
      const dataUrl = await imageUrlToDataUrl(imageUrl, controller.signal);
      return { dataUrl, url: imageUrl };
    } catch (error) {
      const err = error as Error;
      if (err.name === "AbortError") throw new Error("Tempo esgotado ao gerar imagem na Kie.ai.");
      if (err.message?.includes("Kie.ai") || err.message?.includes("imagem")) throw err;
      throw new Error(`Falha ao gerar imagem pela Kie.ai: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }
  });


export const testNanoBananaConnection = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; message: string; model: string; dataUrl?: string }> => {
    const apiKey = process.env.KIE_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false,
        model: KIE_IMAGE_MODEL,
        message: "KIE_API_KEY não configurada no servidor.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KIE_IMAGE_TIMEOUT_MS);
    const testPrompt = `Create a polished square Instagram advertising test card, 1:1, dark premium background with subtle orange and gold lighting, one realistic gourmet burger as the hero product, professional editorial composition, clean safe margins. Render exactly this short Portuguese text: "NANO BANANA OK". Do not add any other words, prices, logos, watermarks or contact details.`;

    try {
      const taskId = await createKieImageTask(apiKey, testPrompt, "1:1", controller.signal);
      const imageUrl = await waitForKieImage(apiKey, taskId, controller.signal);
      const dataUrl = await imageUrlToDataUrl(imageUrl, controller.signal);
      return {
        ok: true,
        model: KIE_IMAGE_MODEL,
        message: `Nano Banana conectado e gerando imagens corretamente pelo modelo ${KIE_IMAGE_MODEL}.`,
        dataUrl,
      };
    } catch (error) {
      const err = error as Error;
      const message = err.name === "AbortError"
        ? "O teste excedeu o tempo limite da Kie.ai."
        : err.message || "Falha desconhecida ao testar o Nano Banana.";
      return { ok: false, model: KIE_IMAGE_MODEL, message };
    } finally {
      clearTimeout(timeout);
    }
  });
