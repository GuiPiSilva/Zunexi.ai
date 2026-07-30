import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, consumeAccessCredit, requireAccessKey } from "@/lib/access.functions";

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
- body: organize somente as informações reais fornecidas pelo usuário de forma clara e bem escrita; inclua data, horário e local apenas quando existirem. Quando o pedido indicar cardápio, lista, catálogo, sabores, preços ou itens detalhados, o body pode ser mais completo, com quebras de linha, seções e itens no estilo "## Seção" e "**Item — preço**".
- imagePrompt: em inglês, descreva SOMENTE o visual principal do cartaz: fotografia ou ilustração coerente com o evento, cenário, assunto, iluminação, textura, profundidade, enquadramento e direção de arte.
- NÃO peça texto, tipografia, letras, números, logotipo, preço, telefone, watermark, moldura ou UI dentro da imagem. A Zunexi adicionará todas as informações depois e achatará a composição na arte final.
- O visual deve parecer produzido para uma campanha de agência, com composição forte e áreas de respiro naturais para receber o layout.
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
// IMAGEM — múltiplos provedores com fallback automático.
//
// Ordem padrão: Cloudflare Workers AI -> Gemini -> NVIDIA NIM/Partner endpoint.
// A ordem pode ser alterada no Vercel com IMAGE_PROVIDER_ORDER.
// Nenhuma chave é enviada ao navegador; todas são lidas somente no servidor.
// ---------------------------------------------------------------------------

const IMAGE_STORAGE_BUCKET = process.env.IMAGE_STORAGE_BUCKET || process.env.GEMINI_STORAGE_BUCKET || "generated-images";

const CLOUDFLARE_MODEL_FAST = process.env.CLOUDFLARE_IMAGE_MODEL_FAST || "@cf/black-forest-labs/flux-2-klein-4b";
const CLOUDFLARE_MODEL_PREMIUM = process.env.CLOUDFLARE_IMAGE_MODEL_PREMIUM || "@cf/black-forest-labs/flux-2-klein-9b";
const CLOUDFLARE_IMAGE_TIMEOUT_MS = Number(process.env.CLOUDFLARE_IMAGE_TIMEOUT_MS || 90_000);

const GEMINI_MODEL_FAST = process.env.GEMINI_IMAGE_MODEL_FAST || "gemini-3.1-flash-lite-image";
const GEMINI_MODEL_PREMIUM = process.env.GEMINI_IMAGE_MODEL_PREMIUM || "gemini-3.1-flash-image";
const GEMINI_IMAGE_API_URL = process.env.GEMINI_IMAGE_API_URL || "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_IMAGE_TIMEOUT_MS = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS || 120_000);

const NVIDIA_IMAGE_API_URL = process.env.NVIDIA_IMAGE_API_URL || "";
const NVIDIA_IMAGE_MODEL = process.env.NVIDIA_IMAGE_MODEL || "qwen-image";
const NVIDIA_IMAGE_TIMEOUT_MS = Number(process.env.NVIDIA_IMAGE_TIMEOUT_MS || 120_000);

const PROVIDER_TEST_TIMEOUT_MS = 15_000;

type ImageQuality = "fast" | "premium";
type ImageProvider = "cloudflare" | "gemini" | "nvidia";
type GeneratedImage = { mimeType: string; bytes: Buffer; provider: ImageProvider; model: string };

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
  imageQuality: z.enum(["fast", "premium"]).optional().default("premium"),
});

const ReferenceImageInput = z.object({
  dataUrl: z.string().min(20).max(15_000_000),
  fileName: z.string().trim().min(1).max(120).default("referencia.png"),
});

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato de imagem inválido.");
  return { mimeType: match[1], base64: match[2] };
}

async function uploadBytesToSupabaseStorage(bytes: Buffer, mimeType: string, pathHint: string): Promise<string> {
  const sb = admin();
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const path = `${pathHint}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await sb.storage.from(IMAGE_STORAGE_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar imagem no Supabase Storage: ${error.message}`);

  const { data } = sb.storage.from(IMAGE_STORAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Não foi possível obter a URL pública da imagem.");
  return data.publicUrl;
}

async function uploadToSupabaseStorage(base64: string, mimeType: string, pathHint: string): Promise<string> {
  return uploadBytesToSupabaseStorage(Buffer.from(base64, "base64"), mimeType, pathHint);
}

function imageSeed(value: string): number {
  if (!value) return Math.floor(Math.random() * 2_147_483_647);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function compactImagePrompt(prompt: string): string {
  const normalized = prompt.replace(/\r/g, "").trim();
  const maxChars = 7_500;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, 4_800)}\n\n[brief compacted]\n\n${normalized.slice(-2_500)}`;
}

function dimensionsForAspectRatio(aspectRatio: "1:1" | "4:5" | "9:16") {
  if (aspectRatio === "4:5") return { width: 1024, height: 1280 };
  if (aspectRatio === "9:16") return { width: 720, height: 1280 };
  return { width: 1024, height: 1024 };
}

function providerErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  try { return JSON.stringify(error); } catch { return String(error); }
}

function imageProviderOrder(): ImageProvider[] {
  const allowed = new Set<ImageProvider>(["cloudflare", "gemini", "nvidia"]);
  const raw = (process.env.IMAGE_PROVIDER_ORDER || "cloudflare,gemini,nvidia")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ImageProvider => allowed.has(item as ImageProvider));
  return [...new Set(raw.length ? raw : ["cloudflare", "gemini", "nvidia"])] as ImageProvider[];
}

function providerConfigured(provider: ImageProvider) {
  if (provider === "cloudflare") return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  return Boolean(NVIDIA_IMAGE_API_URL && process.env.NVIDIA_API_KEY);
}

function cloudflareModelFor(quality: ImageQuality) {
  return quality === "fast" ? CLOUDFLARE_MODEL_FAST : CLOUDFLARE_MODEL_PREMIUM;
}

function geminiModelFor(quality: ImageQuality) {
  return quality === "fast" ? GEMINI_MODEL_FAST : GEMINI_MODEL_PREMIUM;
}

function decodeBase64Image(value: string, fallbackMime = "image/jpeg") {
  const dataUrl = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(value);
  const mimeType = dataUrl?.[1] || fallbackMime;
  const base64 = dataUrl?.[2] || value;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw new Error("O provedor retornou uma imagem vazia.");
  return { mimeType, bytes };
}

async function callCloudflareImage(
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  seed: string,
  quality: ImageQuality,
): Promise<GeneratedImage> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("Cloudflare não configurada: faltam CLOUDFLARE_ACCOUNT_ID e/ou CLOUDFLARE_API_TOKEN.");

  const model = cloudflareModelFor(quality);
  const { width, height } = dimensionsForAspectRatio(aspectRatio);
  const form = new FormData();
  form.append("prompt", compactImagePrompt(prompt));
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("seed", String(imageSeed(seed)));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUDFLARE_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type")?.split(";")[0] || "";
    if (contentType.startsWith("image/")) {
      if (!response.ok) throw new Error(`Cloudflare retornou ${response.status}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("Cloudflare retornou uma imagem vazia.");
      return { mimeType: contentType, bytes, provider: "cloudflare", model };
    }

    const raw = await response.text();
    let json: any = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch { /* mantém raw para diagnóstico */ }
    if (!response.ok || json?.success === false) {
      const detail = json?.errors?.[0]?.message || json?.message || raw.slice(0, 500) || "erro sem detalhes";
      throw new Error(`Cloudflare Workers AI ${response.status}: ${detail}`);
    }

    const encoded = json?.result?.image || json?.image || (typeof json?.result === "string" ? json.result : "");
    if (!encoded) throw new Error("Cloudflare respondeu sem o campo de imagem esperado.");
    const decoded = decodeBase64Image(encoded, "image/jpeg");
    return { ...decoded, provider: "cloudflare", model };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Cloudflare excedeu ${Math.round(CLOUDFLARE_IMAGE_TIMEOUT_MS / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

type GeminiInteractionResponse = {
  steps?: Array<{ content?: Array<{ type?: string; data?: string; mime_type?: string }> }>;
  output_image?: { data?: string; mime_type?: string };
  error?: { message?: string; status?: string; code?: number };
};

async function callGeminiImage(
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  quality: ImageQuality,
): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini não configurado: falta GEMINI_API_KEY.");
  const model = geminiModelFor(quality);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(GEMINI_IMAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: compactImagePrompt(prompt),
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: aspectRatio,
          image_size: "1K",
        },
      }),
    });

    const raw = await response.text();
    let json: GeminiInteractionResponse = {};
    try { json = raw ? JSON.parse(raw) as GeminiInteractionResponse : {}; } catch {
      throw new Error(`Gemini retornou uma resposta inválida (${response.status}): ${raw.slice(0, 400)}`);
    }
    if (!response.ok) {
      throw new Error(`Gemini API ${response.status}: ${json.error?.message || raw.slice(0, 500) || "erro sem detalhes"}`);
    }

    const convenience = json.output_image;
    if (convenience?.data) {
      const decoded = decodeBase64Image(convenience.data, convenience.mime_type || "image/jpeg");
      return { ...decoded, provider: "gemini", model };
    }

    for (const step of json.steps || []) {
      for (const content of step.content || []) {
        if (content.type === "image" && content.data) {
          const decoded = decodeBase64Image(content.data, content.mime_type || "image/jpeg");
          return { ...decoded, provider: "gemini", model };
        }
      }
    }
    throw new Error("Gemini respondeu sem imagem na interação.");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gemini excedeu ${Math.round(GEMINI_IMAGE_TIMEOUT_MS / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callNvidiaImage(
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  seed: string,
): Promise<GeneratedImage> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA não configurada: falta NVIDIA_API_KEY.");
  if (!NVIDIA_IMAGE_API_URL) throw new Error("NVIDIA não configurada para imagens: falta NVIDIA_IMAGE_API_URL de um NIM/Partner Endpoint.");

  const { width, height } = dimensionsForAspectRatio(aspectRatio);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NVIDIA_IMAGE_TIMEOUT_MS);
  try {
    const configuredFormat = (process.env.NVIDIA_IMAGE_API_FORMAT || "").trim().toLowerCase();
    const apiFormat = configuredFormat || (NVIDIA_IMAGE_API_URL.includes("/v1/infer") ? "nim" : "openai");
    const body = apiFormat === "nim"
      ? {
          prompt: compactImagePrompt(prompt),
          seed: imageSeed(seed),
        }
      : {
          model: NVIDIA_IMAGE_MODEL,
          prompt: compactImagePrompt(prompt),
          size: `${width}x${height}`,
          response_format: "b64_json",
          n: 1,
        };

    const response = await fetch(NVIDIA_IMAGE_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get("content-type")?.split(";")[0] || "";
    if (contentType.startsWith("image/")) {
      if (!response.ok) throw new Error(`NVIDIA retornou ${response.status}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("NVIDIA retornou uma imagem vazia.");
      return { mimeType: contentType, bytes, provider: "nvidia", model: NVIDIA_IMAGE_MODEL };
    }

    const raw = await response.text();
    let json: any = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch {
      throw new Error(`NVIDIA retornou uma resposta inválida (${response.status}): ${raw.slice(0, 400)}`);
    }
    if (!response.ok) {
      const detail = json?.detail || json?.error?.message || json?.message || raw.slice(0, 500) || "erro sem detalhes";
      throw new Error(`NVIDIA Image API ${response.status}: ${detail}`);
    }

    const encoded = json?.artifacts?.[0]?.base64 || json?.data?.[0]?.b64_json || json?.image || json?.result?.image;
    if (!encoded) throw new Error("NVIDIA respondeu sem base64 da imagem.");
    const decoded = decodeBase64Image(encoded, "image/jpeg");
    return { ...decoded, provider: "nvidia", model: NVIDIA_IMAGE_MODEL };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`NVIDIA excedeu ${Math.round(NVIDIA_IMAGE_TIMEOUT_MS / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateWithProviderFallback(
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  seed: string,
  quality: ImageQuality,
): Promise<GeneratedImage> {
  const configured = imageProviderOrder().filter(providerConfigured);
  if (!configured.length) {
    throw new Error("Nenhum provedor de imagem está configurado no Vercel. Configure Cloudflare, Gemini ou NVIDIA NIM.");
  }

  const failures: string[] = [];
  for (const provider of configured) {
    try {
      if (provider === "cloudflare") return await callCloudflareImage(prompt, aspectRatio, seed, quality);
      if (provider === "gemini") return await callGeminiImage(prompt, aspectRatio, quality);
      return await callNvidiaImage(prompt, aspectRatio, seed);
    } catch (error) {
      const detail = providerErrorMessage(error);
      console.error(`[image-provider:${provider}]`, detail);
      failures.push(`${provider}: ${detail}`);
    }
  }

  throw new Error(`Todos os provedores de imagem configurados falharam. ${failures.join(" | ")}`);
}


export const uploadReferenceImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReferenceImageInput.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { mimeType, base64 } = parseDataUrl(data.dataUrl);
    const url = await uploadToSupabaseStorage(base64, mimeType, "referencia");
    return { url };
  });

function creativeProfile(data: z.infer<typeof ImageInput>) {
  const haystack = `${data.prompt} ${data.slideTitle} ${data.slideBody} ${data.slideKind} ${data.style} ${data.brand}`.toLowerCase();

  if (/hamb|burger|food|comida|restaurante|lanche|pizza|sorvet|bebida|drink|café|cafe|gastron|card[aá]pio/.test(haystack)) {
    return `FOOD POSTER CAMPAIGN DIRECTION:
- Visual language: premium charcoal-black textured background, warm ember particles, smoke/steam, dark wood or stone surface, amber/orange practical light accents and cream highlights.
- The food must be a LARGE hero, usually 45-70% of the frame, sharply appetizing, glossy but believable, with strong rim light and deep controlled shadows.
- Prefer close-up advertising photography, low three-quarter angles, macro ingredient detail, dramatic depth and layered foreground/background.
- Create natural dark negative-space zones where large distressed display typography, prices, badges and menu information can be added later.
- For menu/list slides, arrange multiple food items in deliberate zones with visual separation, like a professional restaurant menu campaign — but DO NOT generate any written text.
- Use fire/smoke/embers only as tasteful atmosphere. Keep ingredients realistic and product colors natural.
- The result should resemble a commissioned burger/pizzeria campaign poster, not a normal restaurant photo and not a minimalist template.`;
  }

  if (/igreja|culto|evangel|worship|church|fé|fe |jesus|crist|biblia|bíblia/.test(haystack)) {
    return `FAITH / VINTAGE EDITORIAL POSTER DIRECTION:
- Use warm parchment, ivory, burgundy, antique-gold and burnt-orange visual language when compatible with the requested palette.
- Favor symbolic central illustration or cinematic subject, refined vintage print texture, ornamental botanical/details and balanced editorial symmetry.
- Leave intentional zones for very large serif display typography and a smaller scripture/supporting line later; DO NOT render letters or verse text inside the image.
- Avoid generic worship stock photography, artificial halos and cheap church flyer aesthetics.
- The result should feel like a premium illustrated editorial poster with classical hierarchy and modern finishing.`;
  }

  if (/tech|tecnolog|software|app|ia|ai |digital|saas|plataforma|zunexi/.test(haystack)) {
    return `TECH LAUNCH POSTER DIRECTION:
- Use a deep black background with controlled electric-blue, violet and magenta light fields, luminous dot-matrix/halftone waves, digital particles and sculptural glow.
- Keep a premium black center or deliberate negative-space area for logo/headline placement later.
- Build strong depth with luminous data-like surfaces around the edges, elegant gradients and high contrast; avoid fake UI screens and cliché circuitry.
- The result should feel like a major AI/software launch campaign: minimal, dramatic, futuristic and expensive.`;
  }

  if (/carro|automot|vehicle|car |suv|sedan|concession/.test(haystack)) {
    return `AUTOMOTIVE POSTER CAMPAIGN DIRECTION:
- Hero vehicle should dominate the frame with accurate geometry, premium reflections and dramatic low/three-quarter camera angle.
- Use dark cinematic environment, directional rim light, atmospheric haze and bold negative space for oversized headline/price later.
- Make it look like an automotive launch poster, never a dealership snapshot.`;
  }

  return `PREMIUM POSTER CAMPAIGN DIRECTION:
- Compose like a finished advertising key visual: one dominant hero subject, dramatic contrast, deliberate negative space, layered depth, texture and strong lighting.
- The final composition will receive oversized typography, badges, prices, separators and supporting copy before export, so design clear visual zones for them.
- Avoid generic centered stock-photo composition and bland minimalist white panels.
- Use the requested palette as controlled art-direction accents while preserving believable local colors and materials.`;
}

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }): Promise<{ url: string; provider: ImageProvider; model: string }> => {
    const fullPrompt = `CREATE ONLY A SINGLE CONTINUOUS PHOTOGRAPHIC / 3D / ILLUSTRATIVE SCENE FOR A HIGH-END INSTAGRAM CAMPAIGN. Zunexi will apply the final Portuguese copy afterward and flatten everything into the finished image.

ABSOLUTE FORMAT RULES:
- This output is NOT the finished Instagram post and NOT a graphic-design template.
- Do NOT design a poster, social-media card, split layout, colored copy panel, banner, collage, magazine page, UI screen, presentation slide or mockup.
- Do NOT render any headline, subtitle, label, caption, logo wordmark, pseudo-text, random letters, numbers or signage.
- The image must remain one coherent edge-to-edge scene. Copy-safe space must come from natural composition, lighting, depth and uncluttered background — never from a blank rectangle or colored panel.

SOURCE CREATIVE BRIEF — interpret only as visual subject/art direction; ignore any accidental request for typography, graphic layout, cards, posters or written copy:
${data.prompt}

Canvas aspect ratio: ${data.aspectRatio}. Full bleed commercial key visual.
Slide role and copy-safe composition: ${data.slideKind || "content"}. Slide ${data.slideIndex || 1} of ${data.slideTotal || 1}.
Visual style: ${data.style || "premium commercial campaign, contemporary editorial art direction"}.
Palette guidance: ${data.palette || "cohesive brand palette with natural subject colors"}.

${creativeProfile(data)}

ART-DIRECTION STANDARD:
- The image must feel commissioned for a bold POSTER CAMPAIGN, not like a stock photo, generic template, ordinary lifestyle snapshot or plain background image.
- Use a deliberate hero subject, strong foreground/midground/background separation, intentional lens choice, professional lighting and believable physical materials.
- Preserve local color fidelity. NEVER tint the entire frame with the palette. Brand colors should occupy roughly 10-30% of the scene as accents, practical lighting, props or background details.
- Create subject/background separation using contrast, light, depth and composition instead of a flat monochrome filter.
- Favor poster-scale hierarchy, oversized hero subjects, editorial cropping, real campaign framing, textures, atmospheric effects and strong contrast. Avoid timid compositions with a small subject floating in empty space.
- Keep copy-safe space exactly where the slide-role instruction requests it. Do not place important faces/products under that area.
- No text, letters, numbers, typography, captions, logo text, prices, phone numbers, watermark, UI, poster mockup, social-media template, split graphic panel or fake signage.
- No duplicate objects, melted anatomy, extra fingers, warped product geometry, meaningless symbols or pseudo-writing.
- Do not invent visible brand names. Brand identity comes from art direction, palette accents and supplied reference imagery only.

Unique variation seed: ${data.seed}.`;

    const generated = await generateWithProviderFallback(fullPrompt, data.aspectRatio, data.seed, data.imageQuality);
    const url = await uploadBytesToSupabaseStorage(generated.bytes, generated.mimeType, `slide-${generated.provider}`);
    return { url, provider: generated.provider, model: generated.model };
  });

type ProviderTestStatus = {
  provider: ImageProvider;
  configured: boolean;
  ok: boolean;
  model: string;
  message: string;
};

async function testCloudflareProvider(quality: ImageQuality): Promise<ProviderTestStatus> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const model = cloudflareModelFor(quality);
  if (!accountId || !token) return { provider: "cloudflare", configured: false, ok: false, model, message: "não configurada" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?search=${encodeURIComponent(model.replace("@cf/", ""))}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) return { provider: "cloudflare", configured: true, ok: false, model, message: `HTTP ${response.status}: ${raw.replace(/\s+/g, " ").slice(0, 220)}` };
    return { provider: "cloudflare", configured: true, ok: true, model, message: "Account ID e token válidos" };
  } catch (error) {
    return { provider: "cloudflare", configured: true, ok: false, model, message: providerErrorMessage(error) };
  } finally { clearTimeout(timeoutId); }
}

async function testGeminiProvider(quality: ImageQuality): Promise<ProviderTestStatus> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = geminiModelFor(quality);
  if (!apiKey) return { provider: "gemini", configured: false, ok: false, model, message: "não configurada" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
      headers: { Accept: "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) return { provider: "gemini", configured: true, ok: false, model, message: `HTTP ${response.status}: ${raw.replace(/\s+/g, " ").slice(0, 220)}` };
    return { provider: "gemini", configured: true, ok: true, model, message: "API key válida e modelo visível" };
  } catch (error) {
    return { provider: "gemini", configured: true, ok: false, model, message: providerErrorMessage(error) };
  } finally { clearTimeout(timeoutId); }
}

async function testNvidiaProvider(): Promise<ProviderTestStatus> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { provider: "nvidia", configured: false, ok: false, model: NVIDIA_IMAGE_MODEL, message: "não configurada" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) return { provider: "nvidia", configured: true, ok: false, model: NVIDIA_IMAGE_MODEL, message: `HTTP ${response.status}: ${raw.replace(/\s+/g, " ").slice(0, 220)}` };
    if (!NVIDIA_IMAGE_API_URL) {
      return { provider: "nvidia", configured: true, ok: false, model: NVIDIA_IMAGE_MODEL, message: "API key válida; falta NVIDIA_IMAGE_API_URL de um NIM/Partner Endpoint para gerar imagens" };
    }
    return { provider: "nvidia", configured: true, ok: true, model: NVIDIA_IMAGE_MODEL, message: "API key válida e endpoint de imagem configurado" };
  } catch (error) {
    return { provider: "nvidia", configured: true, ok: false, model: NVIDIA_IMAGE_MODEL, message: providerErrorMessage(error) };
  } finally { clearTimeout(timeoutId); }
}

export const testImageProvidersConnection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ imageQuality: z.enum(["fast", "premium"]).optional().default("premium") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; providers: ProviderTestStatus[]; order: ImageProvider[] }> => {
    const providers = await Promise.all([
      testCloudflareProvider(data.imageQuality),
      testGeminiProvider(data.imageQuality),
      testNvidiaProvider(),
    ]);
    const order = imageProviderOrder();
    const usable = providers.filter((item) => item.ok);
    const configured = providers.filter((item) => item.configured);
    const summary = providers.map((item) => `${item.provider}: ${item.ok ? "OK" : item.message}`).join(" • ");
    return {
      ok: usable.length > 0,
      providers,
      order,
      message: usable.length
        ? `${usable.length} provedor(es) pronto(s). Ordem de fallback: ${order.join(" → ")}. ${summary}`
        : configured.length
          ? `Nenhum provedor de imagem está pronto. ${summary}`
          : "Nenhum provedor de imagem foi configurado no Vercel.",
    };
  });
