import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, consumeAccessCredit, requireAccessKey, requireTenantContext } from "@/lib/access.functions";
import { brandContextAsPrompt, resolveBrandContext } from "@/lib/brand.functions";
import { planHasFeature } from "@/lib/plans";
import { explicitHumanVisualRequest, explicitInterfaceVisualRequest } from "@/lib/creative-engine";
import { LAYOUT_IDS } from "@/lib/layouts";

const GROQ_TEXT_TIMEOUT_MS = 45_000;

interface SlideOut {
  title: string;
  body: string;
  imagePrompt: string;
  layout?: string;
  visualConcept?: string;
  textZone?: string;
  subjectZone?: string;
  allowPeople?: boolean;
  reviewScore?: number;
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
  brandId: z.string().uuid().optional().nullable(),
});

export const generateCartaz = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CartazInput.parse(d))
  .handler(async ({ data }): Promise<SlideOut> => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const brand = await resolveBrandContext(sb, context, data.brandId);
    const brandPrompt = brandContextAsPrompt(brand);
    await consumeAccessCredit(sb, data.accessKey, data.jobId);
    const allowPeople = explicitHumanVisualRequest(data.title, data.kind, data.style, data.extra);
    const allowInterfaces = explicitInterfaceVisualRequest(data.title, data.kind, data.style, data.extra);
    const sys = `Você é diretor de arte especializado em cartazes profissionais para Instagram. Retorne apenas JSON válido: { "title": "...", "body": "...", "imagePrompt": "...", "layout": "text-over-image", "visualConcept": "...", "textZone": "left", "subjectZone": "right", "allowPeople": false, "reviewScore": 95 }.

REGRAS:
- title: chamada principal curta e impactante em português.
- body: organize somente as informações reais fornecidas pelo usuário de forma clara e bem escrita; inclua data, horário e local apenas quando existirem. Quando o pedido indicar cardápio, lista, catálogo, sabores, preços ou itens detalhados, o body pode ser mais completo, com quebras de linha, seções e itens no estilo "## Seção" e "**Item — preço**".
- imagePrompt: em inglês, descreva SOMENTE o visual principal do cartaz: fotografia ou ilustração coerente com o evento, cenário, assunto, iluminação, textura, profundidade, enquadramento e direção de arte.
- NÃO peça texto, tipografia, letras, números, logotipo, preço, telefone, watermark ou moldura dentro da imagem. A Zunexi adicionará todas as informações depois e achatará a composição na arte final.
- Telas, dashboards, apps e mockups estão ${allowInterfaces ? "permitidos somente quando indispensáveis ao pedido explícito; não peça pseudo-texto ou labels inventados" : "PROIBIDOS. Se o tema for tecnologia, represente-o com direção de arte abstrata/espacial, objetos, luz e materiais, não com uma interface falsa"}.
- O visual deve parecer produzido para uma campanha de agência, com composição forte e áreas de respiro naturais para receber o layout.
- Não invente preço, telefone, endereço, atrações, datas, logotipo ou qualquer informação que não foi enviada.
- Adapte a direção visual ao tipo do evento: igreja deve ser elegante e inspiradora; música deve ser energética; palestra deve ser sofisticada; promoção deve ser comercial e clara.
- Escolha layout entre: ${LAYOUT_IDS.join(", ")}. Use textZone e subjectZone separados.
- Pessoas estão ${allowPeople ? "permitidas porque foram solicitadas explicitamente" : "PROIBIDAS: não inclua pessoas, rostos, mãos, corpos, silhuetas ou multidões"}.
- visualConcept deve explicar a ideia visual específica, e reviewScore deve avaliar a qualidade final de 0 a 100.`;
    const user = `${brandPrompt}

Evento: ${data.title}
Tipo: ${data.kind}
Data: ${data.date} ${data.time}
Local: ${data.place}
Estilo: ${data.style}
Extras: ${data.extra}
Seed única: ${data.seed}-${Math.random().toString(36).slice(2)}`;
    const raw = await callChat([{ role: "system", content: sys }, { role: "user", content: user }]);
    let output = JSON.parse(raw) as SlideOut;

    if (process.env.GROQ_CREATIVE_REVIEW_ENABLED !== "false") {
      try {
        const reviewedRaw = await callChat([
          {
            role: "system",
            content: `Você é o revisor final da Zunexi. Devolva somente o mesmo JSON corrigido. Preserve apenas dados fornecidos, melhore título e body sem inventar informações, mantenha imagePrompt em inglês e sem texto dentro da imagem, use um layout válido entre ${LAYOUT_IDS.join(", ")}, separe textZone de subjectZone e defina reviewScore. Pessoas estão ${allowPeople ? "permitidas" : "proibidas em qualquer forma"}.`,
          },
          { role: "user", content: `Briefing: ${user}\n\nRascunho: ${JSON.stringify(output)}` },
        ]);
        output = JSON.parse(reviewedRaw) as SlideOut;
      } catch (error) {
        console.warn("Revisor do cartaz indisponível; usando rascunho aprovado localmente.", error);
      }
    }

    const requestedLayout = String(output.layout || "");
    return {
      title: String(output.title || data.title).trim(),
      body: String(output.body || "").trim(),
      imagePrompt: String(output.imagePrompt || "").trim(),
      layout: (LAYOUT_IDS as readonly string[]).includes(requestedLayout) ? requestedLayout : "text-over-image",
      visualConcept: String(output.visualConcept || "").trim(),
      textZone: String(output.textZone || "left").trim(),
      subjectZone: String(output.subjectZone || "right").trim(),
      allowPeople,
      reviewScore: typeof output.reviewScore === "number" ? Math.max(0, Math.min(100, Math.round(output.reviewScore))) : undefined,
    };
  });


// ---------------------------------------------------------------------------
// IMAGEM — Colab + Cloudflare com fallback automático.
//
// Ordem padrão: Colab -> Cloudflare Workers AI.
// A ordem pode ser alterada no Vercel com IMAGE_PROVIDER_ORDER.
// A API do Colab deve expor GET /health e POST /generate.
// Nenhuma chave é enviada ao navegador; todas são lidas somente no servidor.
// ---------------------------------------------------------------------------

const IMAGE_STORAGE_BUCKET = process.env.IMAGE_STORAGE_BUCKET || "generated-images";

const CLOUDFLARE_MODEL_FAST = process.env.CLOUDFLARE_IMAGE_MODEL_FAST || "@cf/black-forest-labs/flux-2-klein-4b";
const CLOUDFLARE_MODEL_PREMIUM = process.env.CLOUDFLARE_IMAGE_MODEL_PREMIUM || "@cf/black-forest-labs/flux-2-klein-9b";
const CLOUDFLARE_IMAGE_TIMEOUT_MS = Number(process.env.CLOUDFLARE_IMAGE_TIMEOUT_MS || 90_000);
const CLOUDFLARE_GUIDANCE_FAST = Number(process.env.CLOUDFLARE_GUIDANCE_FAST || 3.2);
const CLOUDFLARE_GUIDANCE_PREMIUM = Number(process.env.CLOUDFLARE_GUIDANCE_PREMIUM || 4.0);

const COLAB_IMAGE_API_URL = (process.env.COLAB_IMAGE_API_URL || "").trim();
const COLAB_IMAGE_API_KEY = (process.env.COLAB_IMAGE_API_KEY || "").trim();
const COLAB_IMAGE_MODEL = (process.env.COLAB_IMAGE_MODEL || "zunexi-colab-image-engine").trim();
const COLAB_IMAGE_TIMEOUT_MS = Number(process.env.COLAB_IMAGE_TIMEOUT_MS || 240_000);

const LOVABLE_API_KEY = (process.env.LOVABLE_API_KEY || "").trim();
const LOVABLE_IMAGE_MODEL = (process.env.LOVABLE_IMAGE_MODEL || "openai/gpt-image-2").trim();
const LOVABLE_IMAGE_TIMEOUT_MS = Number(process.env.LOVABLE_IMAGE_TIMEOUT_MS || 180_000);

const PROVIDER_TEST_TIMEOUT_MS = 15_000;

type ImageQuality = "fast" | "premium";
type ImageProvider = "colab" | "cloudflare" | "lovable";
type ImageProviderChoice = "auto" | ImageProvider;
type GeneratedImage = { mimeType: string; bytes: Buffer; provider: ImageProvider; model: string };

const ImageInput = z.object({
  accessKey: z.string().trim().min(4).max(64),
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
  imageProvider: z.enum(["auto", "colab", "cloudflare", "lovable"]).optional().default("auto"),
  allowPeople: z.boolean().optional().default(false),
  allowInterfaces: z.boolean().optional().default(false),
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

function compactCloudflarePrompt(prompt: string): string {
  // FLUX.2 klein roda com apenas 4 etapas no Workers AI. Para esse motor,
  // um brief mais curto, concreto e sem listas contraditórias tende a ser
  // mais útil do que o prompt universal longo usado pelos outros motores.
  const normalized = prompt
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const maxChars = 3_900;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, 3_250)}\n\nFinal constraints: full-bleed single scene, strong hierarchy, natural copy-safe space, no readable text, no invented logos or watermarks.`;
}

function cloudflareGuidanceFor(quality: ImageQuality) {
  const raw = quality === "premium" ? CLOUDFLARE_GUIDANCE_PREMIUM : CLOUDFLARE_GUIDANCE_FAST;
  return Number.isFinite(raw) ? Math.max(0, Math.min(20, raw)) : quality === "premium" ? 4 : 3.2;
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

function normalizedColabBaseUrl(): string {
  return COLAB_IMAGE_API_URL.replace(/\/+$/, "").replace(/\/(?:generate|health)$/i, "");
}

function colabGenerateUrl(): string {
  const base = normalizedColabBaseUrl();
  return base ? `${base}/generate` : "";
}

function colabHealthUrl(): string {
  const base = normalizedColabBaseUrl();
  return base ? `${base}/health` : "";
}

function colabHeaders(json = false): Record<string, string> {
  return {
    Accept: json ? "application/json, image/*" : "image/*, application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(COLAB_IMAGE_API_KEY ? {
      "X-API-Key": COLAB_IMAGE_API_KEY,
      Authorization: `Bearer ${COLAB_IMAGE_API_KEY}`,
    } : {}),
  };
}

function imageProviderOrder(): ImageProvider[] {
  const allowed = new Set<ImageProvider>(["colab", "cloudflare", "lovable"]);
  const raw = (process.env.IMAGE_PROVIDER_ORDER || "colab,cloudflare,lovable")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ImageProvider => allowed.has(item as ImageProvider));

  const order = [...new Set(raw.length ? raw : ["colab", "cloudflare", "lovable"])] as ImageProvider[];
  // Evita excluir acidentalmente um provedor que está configurado no Vercel.
  for (const fallback of ["colab", "cloudflare", "lovable"] as ImageProvider[]) {
    if (providerConfigured(fallback) && !order.includes(fallback)) order.push(fallback);
  }
  return order;
}

function providerConfigured(provider: ImageProvider) {
  if (provider === "colab") return Boolean(normalizedColabBaseUrl());
  if (provider === "cloudflare") return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  return Boolean(LOVABLE_API_KEY);
}

function cloudflareModelFor(quality: ImageQuality) {
  return quality === "fast" ? CLOUDFLARE_MODEL_FAST : CLOUDFLARE_MODEL_PREMIUM;
}

function decodeBase64Image(value: string, fallbackMime = "image/png") {
  const dataUrl = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(value);
  const mimeType = dataUrl?.[1] || fallbackMime;
  const base64 = dataUrl?.[2] || value;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw new Error("O provedor retornou uma imagem vazia.");
  return { mimeType, bytes };
}

async function fetchImageUrl(url: string): Promise<{ mimeType: string; bytes: Buffer }> {
  const response = await fetch(url, { headers: { Accept: "image/*" } });
  if (!response.ok) throw new Error(`A URL da imagem retornou HTTP ${response.status}.`);
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png";
  if (!mimeType.startsWith("image/")) throw new Error(`A URL retornada pelo Colab não é uma imagem (${mimeType}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("A URL retornada pelo Colab contém uma imagem vazia.");
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
  form.append("prompt", compactCloudflarePrompt(prompt));
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("seed", String(imageSeed(seed)));
  form.append("guidance", String(cloudflareGuidanceFor(quality)));

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

async function callColabImage(
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  seed: string,
  quality: ImageQuality,
): Promise<GeneratedImage> {
  const endpoint = colabGenerateUrl();
  if (!endpoint) throw new Error("Colab não configurado: falta COLAB_IMAGE_API_URL.");

  const { width, height } = dimensionsForAspectRatio(aspectRatio);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COLAB_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: colabHeaders(true),
      signal: controller.signal,
      body: JSON.stringify({
        prompt: compactImagePrompt(prompt),
        width,
        height,
        seed: imageSeed(seed),
        quality,
        aspect_ratio: aspectRatio,
        model: COLAB_IMAGE_MODEL,
        response_format: "png",
      }),
    });

    const contentType = response.headers.get("content-type")?.split(";")[0] || "";
    if (contentType.startsWith("image/")) {
      if (!response.ok) throw new Error(`Colab Image API ${response.status}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("Colab retornou uma imagem vazia.");
      return { mimeType: contentType, bytes, provider: "colab", model: COLAB_IMAGE_MODEL };
    }

    const raw = await response.text();
    let json: any = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch {
      throw new Error(`Colab retornou uma resposta inválida (${response.status}): ${raw.slice(0, 400)}`);
    }
    if (!response.ok || json?.ok === false) {
      const detail = json?.error?.message || json?.error || json?.detail || json?.message || raw.slice(0, 500) || "erro sem detalhes";
      throw new Error(`Colab Image API ${response.status}: ${detail}`);
    }

    const encoded =
      json?.image ||
      json?.base64 ||
      json?.b64_json ||
      json?.result?.image ||
      json?.result?.base64 ||
      json?.data?.[0]?.b64_json ||
      "";

    if (encoded) {
      const decoded = decodeBase64Image(encoded, json?.mime_type || json?.mimeType || "image/png");
      return { ...decoded, provider: "colab", model: json?.model || COLAB_IMAGE_MODEL };
    }

    const imageUrl = json?.url || json?.image_url || json?.result?.url || json?.data?.[0]?.url || "";
    if (imageUrl) {
      const downloaded = await fetchImageUrl(imageUrl);
      return { ...downloaded, provider: "colab", model: json?.model || COLAB_IMAGE_MODEL };
    }

    throw new Error("Colab respondeu sem imagem, base64 ou URL reconhecível.");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Colab excedeu ${Math.round(COLAB_IMAGE_TIMEOUT_MS / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callLovableImage(
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  _seed: string,
  _quality: ImageQuality,
): Promise<GeneratedImage> {
  if (!LOVABLE_API_KEY) throw new Error("Lovable AI não configurada: falta LOVABLE_API_KEY.");

  // O projeto criado no Lovable usa exatamente o gateway abaixo com openai/gpt-image-2.
  // Para 4:5 e 9:16 usamos o tamanho vertical aceito pelo motor, mantendo a proporção desejada no prompt.
  const size = aspectRatio === "1:1" ? "1024x1024" : "1024x1536";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOVABLE_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: LOVABLE_IMAGE_MODEL,
        prompt: compactImagePrompt(`${prompt}\n\nRequested canvas aspect ratio: ${aspectRatio}.`),
        size,
        quality: "medium",
        n: 1,
      }),
    });

    const raw = await response.text();
    let json: any = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch {
      throw new Error(`Lovable AI retornou uma resposta inválida (${response.status}): ${raw.slice(0, 500)}`);
    }

    if (!response.ok) {
      const detail = json?.error?.message || json?.message || raw.slice(0, 500) || "erro sem detalhes";
      if (response.status === 402) throw new Error("Lovable AI sem créditos disponíveis.");
      if (response.status === 429) throw new Error("Limite do Lovable AI atingido. Tente novamente em instantes.");
      throw new Error(`Lovable AI ${response.status}: ${detail}`);
    }

    const encoded =
      json?.b64_json ||
      json?.image?.b64_json ||
      json?.data?.[0]?.b64_json ||
      json?.partial_image_b64 ||
      "";
    if (encoded) {
      const decoded = decodeBase64Image(encoded, "image/png");
      return { ...decoded, provider: "lovable", model: LOVABLE_IMAGE_MODEL };
    }

    const imageUrl = json?.url || json?.data?.[0]?.url || json?.image?.url || "";
    if (imageUrl) {
      const downloaded = await fetchImageUrl(imageUrl);
      return { ...downloaded, provider: "lovable", model: LOVABLE_IMAGE_MODEL };
    }

    throw new Error("Lovable AI respondeu sem imagem reconhecível.");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Lovable AI excedeu ${Math.round(LOVABLE_IMAGE_TIMEOUT_MS / 1000)}s.`);
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
  preferredProvider: ImageProviderChoice = "auto",
  providerPrompts?: Partial<Record<ImageProvider, string>>,
): Promise<GeneratedImage> {
  const configured = imageProviderOrder().filter(providerConfigured);
  if (!configured.length) {
    throw new Error("Nenhum provedor de imagem está configurado no Vercel. Configure Colab, Cloudflare e/ou LOVABLE_API_KEY.");
  }

  const providers: ImageProvider[] = preferredProvider === "auto"
    ? configured
    : providerConfigured(preferredProvider)
      ? [preferredProvider]
      : [];

  if (!providers.length && preferredProvider !== "auto") {
    const providerName = preferredProvider === "colab" ? "Colab" : preferredProvider === "cloudflare" ? "Cloudflare" : "Lovable / GPT Image 2";
    throw new Error(`O motor ${providerName} foi selecionado, mas não está configurado no servidor.`);
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const providerPrompt = providerPrompts?.[provider] || prompt;
      if (provider === "colab") return await callColabImage(providerPrompt, aspectRatio, seed, quality);
      if (provider === "cloudflare") return await callCloudflareImage(providerPrompt, aspectRatio, seed, quality);
      return await callLovableImage(providerPrompt, aspectRatio, seed, quality);
    } catch (error) {
      const detail = providerErrorMessage(error);
      console.error(`[image-provider:${provider}]`, detail);
      failures.push(`${provider}: ${detail}`);
    }
  }

  if (preferredProvider !== "auto") {
    throw new Error(`O motor selecionado falhou. ${failures.join(" | ")}`);
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
    return `TECH / CONTENT CREATION CAMPAIGN DIRECTION:
- Make the visual meaning obvious. Use concrete editorial metaphors for the function: organized media cards, modular content tiles, calendar/scheduling blocks, publishing connections, brand-asset layers, image/text creation tools or analytics objects.
- Use a deep black or brand-led background with controlled electric-blue/violet accents, subtle dot matrices, restrained particles and premium material detail.
- Keep deliberate negative space for the renderer.
- Do NOT generate random glass sculptures, crystals, meaningless 3D symbols, generic AI brains, holograms or cliché circuitry.
- Avoid fake UI screens unless the user explicitly requested an interface.
- The result should feel like a premium SaaS campaign art asset with a clear connection to the message, not generic 'AI art'.`;
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

function cloudflareDomainDirection(data: z.infer<typeof ImageInput>) {
  const haystack = `${data.prompt} ${data.slideTitle} ${data.slideBody} ${data.slideKind} ${data.style} ${data.brand}`.toLowerCase();

  if (/hamb|burger|food|comida|restaurante|lanche|pizza|sorvet|bebida|drink|café|cafe|gastron|card[aá]pio/.test(haystack)) {
    return "Premium food advertising photography. Make the food the large appetizing hero (about half of the frame), realistic ingredients, rich texture, controlled highlights, cinematic side/rim light, shallow-to-medium depth of field, subtle steam or atmosphere when natural, dark stone/wood/table surfaces when appropriate.";
  }
  if (/tech|tecnolog|software|app|ia|ai |digital|saas|plataforma|zunexi/.test(haystack)) {
    return "Premium technology launch visual. Build a relevant metaphor for digital creation, publishing flow, content organization or AI-assisted production. Prefer layered media cards, modular asset blocks, refined device-adjacent objects, structured digital surfaces and purposeful spatial geometry over random symbols. Use controlled blue-violet light, elegant particles, dimensional depth and expensive cinematic lighting. Avoid fake software screens and avoid isolated abstract logo-like sculptures.";
  }
  if (/carro|automot|vehicle|car |suv|sedan|concession/.test(haystack)) {
    return "Premium automotive launch photography. Accurate vehicle geometry, dominant three-quarter hero angle, low camera, controlled reflections, dramatic rim lighting, subtle haze, believable environment and strong product separation.";
  }
  if (/igreja|culto|evangel|worship|church|fé|fe |jesus|crist|biblia|bíblia/.test(haystack)) {
    return "Refined inspirational editorial visual. Elegant symbolic imagery, warm dimensional light, premium texture, tasteful classical details, balanced composition and modern finishing. Avoid cheap flyer aesthetics.";
  }
  if (/advoc|jur[ií]dic|law |direito|escrit[oó]rio/.test(haystack)) {
    return "Premium legal/corporate campaign visual. Architectural precision, refined materials, confident geometry, controlled neutral lighting, subtle depth and sophisticated editorial composition. Avoid cliché gavels unless explicitly requested.";
  }
  if (/odont|dent|cl[ií]nica|sa[uú]de|health|medic/.test(haystack)) {
    return "Premium healthcare campaign visual. Clean but dimensional commercial photography or refined 3D objects, soft controlled light, high material realism, calm trust-building composition and subtle brand accents without sterile blank-white template styling.";
  }
  return "Premium commercial advertising key visual. One unmistakable hero subject, layered foreground/midground/background, believable materials, intentional lens perspective, strong but controlled lighting, editorial cropping and campaign-level polish.";
}

function cloudflareVariation(data: z.infer<typeof ImageInput>) {
  const variants = [
    "Camera/composition variant: low three-quarter perspective, close hero crop, strong depth, subject pushed away from the copy-safe zone.",
    "Camera/composition variant: editorial side angle, asymmetrical framing, foreground detail, strong leading lines and layered depth.",
    "Camera/composition variant: near-macro commercial detail with a bold hero scale, shallow foreground separation and controlled atmospheric background.",
    "Camera/composition variant: cinematic wide-medium frame, diagonal depth, dramatic practical light and one dominant focal point.",
    "Camera/composition variant: top/oblique advertising view when appropriate, graphic object arrangement, clear hierarchy and natural breathing room.",
    "Camera/composition variant: premium studio/environment hybrid, strong silhouette separation, textured background depth and restrained accent lighting.",
  ];
  const key = `${data.seed}|${data.slideIndex}|${data.slideTitle}|${data.prompt}`;
  return variants[imageSeed(key) % variants.length];
}

function cleanCloudflareSourceBrief(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\b(?:headline|subtitle|caption|typography|texto|t[ií]tulo|subt[ií]tulo|copy)\s*[:=-]?\s*[“"'][^”"']+[”"']/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_650);
}

function slideMeaningDirection(data: z.infer<typeof ImageInput>) {
  const haystack = `${data.slideTitle} ${data.slideBody} ${data.prompt} ${data.slideKind}`.toLowerCase();

  if (/rapid|rápid|agil|veloc|minutes|minutos|instant|aceler/.test(haystack)) {
    return "Translate the idea into speed and momentum: layered media panels, directional light trails, modular cards in forward motion, fast publishing cues and elegant visual acceleration. Avoid generic speed icons.";
  }
  if (/planej|agenda|organiz|fluxo|process|workflow|etapas|publica[cç][aã]o|schedule/.test(haystack)) {
    return "Translate the idea into organization and publishing flow: structured content blocks, modular creative assets, calendar-like markers without readable text, sequencing cues and orderly composition.";
  }
  if (/qualidade|consist|padr[aã]o|previs[ií]vel|confi|controle|precis[aã]o/.test(haystack)) {
    return "Translate the idea into consistency and control: precise alignment, repeated modular forms with elegant variation, stable geometry, trustworthy spacing, crisp material finish and visual order.";
  }
  if (/criativ|ideias|inspira[cç][aã]o|autonomia|liberdade|cria[rç][aã]o/.test(haystack)) {
    return "Translate the idea into creative freedom and ideation: layered brand assets, floating media fragments, modular composition pieces, expressive but disciplined motion and clear visual hierarchy.";
  }
  if (/profission|marca|brand|identidade|visual|premium/.test(haystack)) {
    return "Translate the idea into professionalism and brand craft: refined editorial composition, brand-asset metaphors, premium finishing, calm hierarchy and polished commercial presentation.";
  }
  return "Choose a hero scene that literally or metaphorically represents the message of the slide. The visual should explain the claim, not merely decorate it.";
}

function slideRoleDirection(data: z.infer<typeof ImageInput>) {
  const haystack = `${data.slideKind} ${data.slideTitle}`.toLowerCase();
  if (/capa|cover/.test(haystack)) return "Cover-slide behavior: one unmistakable hero subject, strong first-glance impact, broad clean copy-safe area and bold but simple hierarchy.";
  if (/cta|call/.test(haystack)) return "CTA-slide behavior: cleaner closure composition, high contrast, confident subject placement, more breathing room and a sense of conclusion.";
  if (/menu|lista|catalog|cat[aá]logo/.test(haystack)) return "List/menu behavior: multiple items may appear only when required by the brief, arranged with clear grouping and deliberate separation, while preserving clean areas for overlay copy.";
  return "Content-slide behavior: the scene should communicate one concrete benefit or idea with a focused hero and enough breathing room for overlay copy.";
}

function buildCloudflarePrompt(data: z.infer<typeof ImageInput>) {
  const source = cleanCloudflareSourceBrief(data.prompt);
  const interfaceRule = data.allowInterfaces
    ? "A device or interface may appear only when it is essential to the user's requested subject. Keep screens secondary and visually clean, with no readable UI copy."
    : "Represent digital/AI themes with objects, light, materials and abstract spatial forms; do not use screens, dashboards, browser windows or app mockups.";
  const humanRule = data.allowPeople
    ? "People may appear only when the source brief needs them; keep anatomy natural and the person purposeful rather than a generic stock model."
    : "Use objects, environments or abstract visual forms only; no people, faces, hands, bodies, silhouettes or crowds.";

  return `High-end Instagram campaign key visual, ${data.aspectRatio}, full bleed, one continuous scene.

MAIN VISUAL IDEA:
${source || "Create a premium visual interpretation of the supplied campaign concept."}

COMPOSITION:
${slideRoleDirection(data)}
${data.slideKind || "Keep one dominant hero subject and preserve a naturally calm copy-safe area."}
${cloudflareVariation(data)}

MESSAGE INTERPRETATION:
${slideMeaningDirection(data)}

ART DIRECTION:
${cloudflareDomainDirection(data)}
Style: ${data.style || "contemporary premium advertising"}.
Brand/palette: ${data.brand || "brand-led campaign"}; use ${data.palette || "a cohesive palette"} as restrained accents, not as a full-frame color wash. Preserve realistic local colors and material tones.

QUALITY TARGET:
Professional campaign photography / refined 3D / polished illustration as appropriate to the brief; strong hero scale; clear subject-background separation; deliberate foreground, midground and background; realistic materials; cinematic but believable lighting; rich micro-texture; crisp focal detail; intentional negative space integrated into the environment. The image should look commissioned by an advertising agency, not like a stock photo or a generic social template.

CLEAN OUTPUT RULES:
${humanRule}
${interfaceRule}
Keep surfaces clean and unlabeled. No readable words, random letters, word fragments, glyphs, numbers, logos, watermarks, prices, signs, badges or fake brand names. No poster/card/template layout, no split colored panel, no giant blank white rectangle, no collage. Avoid irrelevant abstract logo-like sculptures, crystals, rings, random metallic glyphs and decorative objects that do not explain the slide message. For software/content topics, every hero object must map to a real idea such as planning, creation, publishing, analytics, organization or brand assets. Do not duplicate the hero object or warp product geometry. Natural copy-safe space must come from composition, depth, shadow, lighting and low-detail environment.

Output only the visual scene; Zunexi adds all typography and graphic elements afterward.`;
}

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }): Promise<{ url: string; provider: ImageProvider; model: string; priority: boolean }> => {
    const access = await requireAccessKey(admin(), data.accessKey);
    const priority = planHasFeature(access.plan, "prioridade_geracao");
    const effectiveQuality: ImageQuality = data.imageQuality === "premium" && priority ? "premium" : "fast";
    const fullPrompt = `CREATE ONLY A SINGLE CONTINUOUS PHOTOGRAPHIC / 3D / ILLUSTRATIVE SCENE FOR A HIGH-END INSTAGRAM CAMPAIGN. Zunexi will apply the final Portuguese copy afterward and flatten everything into the finished image.

ABSOLUTE FORMAT RULES:
- This output is NOT the finished Instagram post and NOT a graphic-design template.
- Do NOT design a poster, social-media card, split layout, colored copy panel, banner, collage, magazine page or presentation slide.
- INTERFACE POLICY: ${data.allowInterfaces ? "A device/interface may appear only because the original user brief explicitly requested it. Keep it secondary, realistic, free of invented readable copy and never turn the whole result into a UI screenshot." : "ABSOLUTELY NO UI: no dashboard, app screen, browser window, phone/laptop screen, social-media interface or software mockup. If software/AI is the subject, represent the idea with premium abstract technology, objects, spatial light, materials and data-like geometry."}
- Do NOT render any headline, subtitle, label, caption, logo wordmark, pseudo-text, random letters, numbers or signage.
- The image must remain one coherent edge-to-edge scene. Copy-safe space must come from natural composition, lighting, depth and uncluttered background — never from a blank rectangle or colored panel.
- HUMAN POLICY: ${data.allowPeople ? "People are allowed only when required by the supplied brief; keep anatomy natural and purposeful." : "ABSOLUTELY NO PEOPLE: no humans, faces, portraits, bodies, hands, silhouettes, crowds, models or human-like figures."}

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
- No text, letters, numbers, typography, captions, logo text, prices, phone numbers, watermark, poster mockup, social-media template, split graphic panel or fake signage. ${data.allowInterfaces ? "If an interface was explicitly requested, keep it realistic and non-readable; do not invent labels or pseudo-copy." : "No UI, dashboard, browser chrome, device screen or fake software interface."}
- Avoid oversized empty white areas. Negative space must look intentional and integrated into the scene, with texture, light or environmental depth.
- No duplicate objects, melted anatomy, extra fingers, warped product geometry, meaningless symbols, pseudo-writing or unrelated abstract logo-like sculptures.
- Do not invent visible brand names. Brand identity comes from art direction, palette accents and supplied reference imagery only.
- For software, AI or content-creation themes, prefer visual metaphors tied to content production, scheduling, branding, media layers and organized creative flow instead of generic futuristic ornaments.

Unique variation seed: ${data.seed}.`;

    const cloudflarePrompt = buildCloudflarePrompt(data);
    const generated = await generateWithProviderFallback(
      fullPrompt,
      data.aspectRatio,
      data.seed,
      effectiveQuality,
      data.imageProvider,
      { cloudflare: cloudflarePrompt },
    );
    const url = await uploadBytesToSupabaseStorage(generated.bytes, generated.mimeType, `slide-${generated.provider}`);
    return { url, provider: generated.provider, model: generated.model, priority };
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

async function testColabProvider(): Promise<ProviderTestStatus> {
  const endpoint = colabHealthUrl();
  if (!endpoint) return { provider: "colab", configured: false, ok: false, model: COLAB_IMAGE_MODEL, message: "não configurado" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      headers: colabHeaders(false),
      signal: controller.signal,
    });
    const raw = await response.text();
    let json: any = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch { /* health pode responder texto */ }
    const model = json?.model || json?.model_id || COLAB_IMAGE_MODEL;
    if (!response.ok || json?.ok === false) {
      const detail = json?.detail || json?.error || json?.message || raw.replace(/\s+/g, " ").slice(0, 220) || `HTTP ${response.status}`;
      return { provider: "colab", configured: true, ok: false, model, message: String(detail) };
    }
    return {
      provider: "colab",
      configured: true,
      ok: true,
      model,
      message: COLAB_IMAGE_API_KEY ? "endpoint online e chave aceita" : "endpoint online (sem COLAB_IMAGE_API_KEY configurada)",
    };
  } catch (error) {
    return { provider: "colab", configured: true, ok: false, model: COLAB_IMAGE_MODEL, message: providerErrorMessage(error) };
  } finally { clearTimeout(timeoutId); }
}

async function testLovableProvider(): Promise<ProviderTestStatus> {
  if (!LOVABLE_API_KEY) return { provider: "lovable", configured: false, ok: false, model: LOVABLE_IMAGE_MODEL, message: "não configurada" };
  return {
    provider: "lovable",
    configured: true,
    ok: true,
    model: LOVABLE_IMAGE_MODEL,
    message: "LOVABLE_API_KEY configurada; validação real ocorre na primeira geração",
  };
}

export const testImageProvidersConnection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ imageQuality: z.enum(["fast", "premium"]).optional().default("premium"), imageProvider: z.enum(["auto", "colab", "cloudflare", "lovable"]).optional().default("auto") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; providers: ProviderTestStatus[]; order: ImageProvider[] }> => {
    const providers = await Promise.all([
      testColabProvider(),
      testCloudflareProvider(data.imageQuality),
      testLovableProvider(),
    ]);
    const order = imageProviderOrder();
    const usable = providers.filter((item) => item.ok);
    const configured = providers.filter((item) => item.configured);
    const summary = providers.map((item) => `${item.provider}: ${item.ok ? "OK" : item.message}`).join(" • ");
    const selected = data.imageProvider === "auto" ? `automático (${order.join(" → ")})` : data.imageProvider;
    return {
      ok: usable.length > 0,
      providers,
      order,
      message: usable.length
        ? `${usable.length} provedor(es) pronto(s). Motor selecionado: ${selected}. Ordem de fallback: ${order.join(" → ")}. ${summary}`
        : configured.length
          ? `Nenhum provedor de imagem está pronto. ${summary}`
          : "Nenhum provedor de imagem foi configurado no Vercel.",
    };
  });
