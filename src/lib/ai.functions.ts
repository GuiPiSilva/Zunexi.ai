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
- imagePrompt: em inglês, descreva SOMENTE o visual principal do cartaz: fotografia ou ilustração coerente com o evento, cenário, assunto, iluminação, textura, profundidade, enquadramento e direção de arte.
- NÃO peça texto, tipografia, letras, números, logotipo, preço, telefone, watermark, moldura ou UI dentro da imagem. A Zunexi adicionará todas as informações como camadas editáveis depois.
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
// IMAGEM — Cloudflare Workers AI via REST API oficial.
// O modo rápido usa FLUX.2 Klein 4B e o modo premium usa FLUX.2 Klein 9B.
// Ambos aceitam multipart/form-data e imagem de referência. O visual gerado
// não contém tipografia: a composição final é montada pelo editor em camadas.
// ---------------------------------------------------------------------------

const CLOUDFLARE_IMAGE_MODELS = {
  fast: process.env.CLOUDFLARE_IMAGE_MODEL_FAST || process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b",
  premium: process.env.CLOUDFLARE_IMAGE_MODEL_PREMIUM || "@cf/black-forest-labs/flux-2-klein-9b",
} as const;

type ImageQuality = keyof typeof CLOUDFLARE_IMAGE_MODELS;

function imageModelFor(quality: ImageQuality) {
  return CLOUDFLARE_IMAGE_MODELS[quality] || CLOUDFLARE_IMAGE_MODELS.premium;
}

const CLOUDFLARE_IMAGE_TIMEOUT_MS = 120_000;
const IMAGE_STORAGE_BUCKET = process.env.IMAGE_STORAGE_BUCKET || process.env.GEMINI_STORAGE_BUCKET || "generated-images";
const CLOUDFLARE_MAX_ATTEMPTS = 3;
const CLOUDFLARE_BASE_DELAY_MS = 2_500;
const CLOUDFLARE_4B_OUTPUT_NEURONS_PER_TILE = 26.05;
const CLOUDFLARE_4B_INPUT_NEURONS_PER_TILE = 5.37;
const CLOUDFLARE_9B_FIRST_MP_NEURONS = 1363.64;
const CLOUDFLARE_9B_SUBSEQUENT_MP_NEURONS = 181.82;
const CLOUDFLARE_9B_INPUT_MP_NEURONS = 181.82;

type CloudflareUsageSource = "generation" | "test";

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
  imageQuality: z.enum(["fast", "premium"]).optional().default("premium"),
});

const ReferenceImageInput = z.object({
  dataUrl: z.string().min(20).max(15_000_000),
  fileName: z.string().trim().min(1).max(120).default("referencia.png"),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato de imagem inválido.");
  return { mimeType: match[1], base64: match[2] };
}

async function uploadToSupabaseStorage(base64: string, mimeType: string, pathHint: string): Promise<string> {
  const sb = admin();
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${pathHint}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = Buffer.from(base64, "base64");

  const { error } = await sb.storage.from(IMAGE_STORAGE_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar imagem no Supabase Storage: ${error.message}`);

  const { data } = sb.storage.from(IMAGE_STORAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Não foi possível obter a URL pública da imagem.");
  return data.publicUrl;
}

async function fetchAsBase64(url: string): Promise<{ mimeType: string; base64: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível baixar a imagem de referência (${response.status}).`);
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { mimeType: contentType.split(";")[0], base64: buffer.toString("base64") };
}

function cloudflareSeed(value: string): number {
  if (!value) return Math.floor(Math.random() * 2_147_483_647);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dimensionsForAspectRatio(aspectRatio: "1:1" | "4:5" | "9:16") {
  if (aspectRatio === "4:5") return { width: 1024, height: 1280 };
  if (aspectRatio === "9:16") return { width: 720, height: 1280 };
  return { width: 1024, height: 1024 };
}

function tileCount(width: number, height: number) {
  return Math.max(1, Math.ceil(width / 512) * Math.ceil(height / 512));
}

function estimateCloudflareNeurons(width: number, height: number, hasReference: boolean, quality: ImageQuality) {
  const model = imageModelFor(quality);
  const megapixels = (width * height) / (1024 * 1024);

  if (model.includes("flux-2-klein-9b")) {
    const outputNeurons = CLOUDFLARE_9B_FIRST_MP_NEURONS + Math.max(0, megapixels - 1) * CLOUDFLARE_9B_SUBSEQUENT_MP_NEURONS;
    const inputNeurons = hasReference ? 0.25 * CLOUDFLARE_9B_INPUT_MP_NEURONS : 0;
    return {
      outputTiles: tileCount(width, height),
      inputTiles: hasReference ? 1 : 0,
      estimatedNeurons: Math.round((outputNeurons + inputNeurons) * 100) / 100,
    };
  }

  const outputTiles = tileCount(width, height);
  const inputTiles = hasReference ? 1 : 0;
  const estimatedNeurons =
    outputTiles * CLOUDFLARE_4B_OUTPUT_NEURONS_PER_TILE +
    inputTiles * CLOUDFLARE_4B_INPUT_NEURONS_PER_TILE;
  return {
    outputTiles,
    inputTiles,
    estimatedNeurons: Math.round(estimatedNeurons * 100) / 100,
  };
}

async function recordCloudflareUsage(args: {
  width: number;
  height: number;
  hasReference: boolean;
  source: CloudflareUsageSource;
  quality: ImageQuality;
}) {
  const model = imageModelFor(args.quality);
  const estimate = estimateCloudflareNeurons(args.width, args.height, args.hasReference, args.quality);
  try {
    const { error } = await admin().from("cloudflare_ai_usage").insert({
      model,
      source: args.source,
      width: args.width,
      height: args.height,
      has_reference: args.hasReference,
      output_tiles: estimate.outputTiles,
      input_tiles: estimate.inputTiles,
      estimated_neurons: estimate.estimatedNeurons,
    });
    if (error) console.warn("Não foi possível registrar uso da Cloudflare no Supabase:", error.message);
  } catch (error) {
    console.warn("Falha não crítica ao registrar uso da Cloudflare:", error);
  }
}

function detectImageMimeType(base64: string): string {
  const bytes = Buffer.from(base64.slice(0, 64), "base64");
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/jpeg";
}

async function callCloudflareImage(
  apiToken: string,
  accountId: string,
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  seed: string,
  referenceImage?: { mimeType: string; base64: string },
  source: CloudflareUsageSource = "generation",
  quality: ImageQuality = "premium",
): Promise<{ mimeType: string; base64: string }> {
  let lastError: Error | null = null;
  const { width, height } = dimensionsForAspectRatio(aspectRatio);
  const model = imageModelFor(quality);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;

  for (let attempt = 1; attempt <= CLOUDFLARE_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLOUDFLARE_IMAGE_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("width", String(width));
      form.append("height", String(height));
      form.append("seed", String(cloudflareSeed(seed)));

      if (referenceImage) {
        const bytes = new Uint8Array(Buffer.from(referenceImage.base64, "base64"));
        const ext = referenceImage.mimeType.includes("jpeg") ? "jpg" : referenceImage.mimeType.split("/")[1] || "png";
        form.append("input_image_0", new Blob([bytes], { type: referenceImage.mimeType }), `reference.${ext}`);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: controller.signal,
        body: form,
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("Cloudflare Workers AI error", response.status, `tentativa ${attempt}/${CLOUDFLARE_MAX_ATTEMPTS}`, body.slice(0, 700));

        if (response.status === 401 || response.status === 403) {
          throw new Error("Token da Cloudflare inválido ou sem permissão para Workers AI.");
        }
        if (response.status === 429) {
          lastError = new Error("Cota ou limite do Cloudflare Workers AI atingido no momento.");
          if (attempt < CLOUDFLARE_MAX_ATTEMPTS) {
            await sleep(CLOUDFLARE_BASE_DELAY_MS * 2 ** (attempt - 1));
            continue;
          }
          throw new Error("Cota do Cloudflare Workers AI atingida. Tente novamente após a renovação da cota.");
        }
        if (response.status >= 500 && attempt < CLOUDFLARE_MAX_ATTEMPTS) {
          lastError = new Error(`Cloudflare Workers AI indisponível temporariamente (${response.status}).`);
          await sleep(CLOUDFLARE_BASE_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`Cloudflare Workers AI retornou um erro (${response.status}).`);
      }

      const responseType = response.headers.get("content-type") || "";
      if (responseType.startsWith("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await recordCloudflareUsage({ width, height, hasReference: Boolean(referenceImage), source, quality });
        return { mimeType: responseType.split(";")[0], base64: buffer.toString("base64") };
      }

      const json = (await response.json()) as {
        success?: boolean;
        result?: { image?: string };
        image?: string;
        errors?: { message?: string }[];
      };
      const base64 = json.result?.image || json.image;
      if (!base64) {
        const apiMessage = json.errors?.map((item) => item.message).filter(Boolean).join("; ");
        throw new Error(apiMessage || "O Cloudflare Workers AI não retornou uma imagem.");
      }

      await recordCloudflareUsage({ width, height, hasReference: Boolean(referenceImage), source, quality });
      return { mimeType: detectImageMimeType(base64), base64 };
    } catch (error) {
      const err = error as Error;
      if (err.name === "AbortError") {
        lastError = new Error("Tempo esgotado ao gerar imagem no Cloudflare Workers AI.");
        if (attempt < CLOUDFLARE_MAX_ATTEMPTS) {
          await sleep(CLOUDFLARE_BASE_DELAY_MS);
          continue;
        }
        throw lastError;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Falha ao gerar imagem no Cloudflare Workers AI após múltiplas tentativas.");
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

  if (/hamb|burger|food|comida|restaurante|lanche|pizza|sorvet|bebida|drink|café|cafe|gastron/.test(haystack)) {
    return `FOOD COMMERCIAL DIRECTION:
- Treat the food/product as a premium hero object, never as a generic lifestyle prop.
- Use tactile macro detail: crisp edges, natural gloss, believable steam/condensation, accurate ingredients and appetizing texture.
- Prefer controlled restaurant/studio lighting, directional highlights, deep but clean shadows and shallow depth of field.
- Avoid beige/orange wash over the whole frame. Keep food colors natural; use brand colors only as small accents in practical lights, props or background details.
- The result should resemble a commissioned restaurant campaign or high-end delivery ad, not stock photography.`;
  }

  if (/carro|automot|vehicle|car |suv|sedan|concession/.test(haystack)) {
    return `AUTOMOTIVE COMMERCIAL DIRECTION:
- Preserve accurate body geometry, wheels, reflections, paint and proportions.
- Use premium automotive campaign lighting, deliberate environment reflections and a strong low/three-quarter camera angle.
- Keep the scene uncluttered and cinematic; avoid generic dealership stock-photo staging.`;
  }

  if (/tech|tecnolog|software|app|ia|ai |digital|saas|plataforma/.test(haystack)) {
    return `TECH CAMPAIGN DIRECTION:
- Create a bold product-launch key visual with sculptural lighting, precise materials, controlled glow and editorial negative space.
- Avoid random holograms, meaningless UI, fake text and cliché blue circuit-board imagery unless explicitly requested.
- Use the palette as lighting accents instead of tinting the entire image.`;
  }

  if (/igreja|culto|evangel|worship|church|fé|fe |jesus|crist/.test(haystack)) {
    return `INSPIRATIONAL EVENT DIRECTION:
- Use cinematic documentary-style light, authentic atmosphere, natural people and emotionally grounded composition.
- Avoid kitschy religious clip-art, artificial halos and generic stock-photo poses.
- Preserve realistic skin tones and use the palette as subtle environmental lighting accents.`;
  }

  return `COMMERCIAL CAMPAIGN DIRECTION:
- Build one strong visual idea with an intentional hero subject and editorial composition.
- Avoid generic stock-photo staging, random props and bland centered compositions.
- Preserve natural material/skin/product colors; use the brand palette as controlled accents rather than a global color filter.`;
}

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }): Promise<{ dataUrl: string; url: string }> => {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiToken) throw new Error("CLOUDFLARE_API_TOKEN não configurado no servidor.");
    if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID não configurado no servidor.");

    const fullPrompt = `CREATE ONLY THE VISUAL LAYER FOR A HIGH-END INSTAGRAM CAMPAIGN. Zunexi will add typography, logos, prices and graphic elements later as editable layers.

SOURCE CREATIVE BRIEF:
${data.prompt}

Canvas aspect ratio: ${data.aspectRatio}. Full bleed commercial key visual.
Slide role and copy-safe composition: ${data.slideKind || "content"}. Slide ${data.slideIndex || 1} of ${data.slideTotal || 1}.
Visual style: ${data.style || "premium commercial campaign, contemporary editorial art direction"}.
Palette guidance: ${data.palette || "cohesive brand palette with natural subject colors"}.

${creativeProfile(data)}

ART-DIRECTION STANDARD:
- The image must feel commissioned for an advertising campaign, not like a stock photo, template, generic AI render or ordinary lifestyle snapshot.
- Use a deliberate hero subject, strong foreground/midground/background separation, intentional lens choice, professional lighting and believable physical materials.
- Preserve local color fidelity. NEVER tint the entire frame with the palette. Brand colors should occupy roughly 10-30% of the scene as accents, practical lighting, props or background details.
- Create subject/background separation using contrast, light, depth and composition instead of a flat monochrome filter.
- Favor asymmetry, editorial cropping and real campaign framing. Avoid placing the main subject dead-center unless the requested composition explicitly needs it.
- Keep copy-safe space exactly where the slide-role instruction requests it. Do not place important faces/products under that area.
- No text, letters, numbers, typography, captions, logo text, prices, phone numbers, watermark, UI, poster mockup or fake signage.
- No duplicate objects, melted anatomy, extra fingers, warped product geometry, meaningless symbols or pseudo-writing.
- Do not invent visible brand names. Brand identity comes from art direction, palette accents and supplied reference imagery only.

${data.referenceImageUrl ? `REFERENCE IMAGE:
- Input image 0 is the primary identity/product reference.
- Preserve recognizable product shape, packaging, logo geometry/colors and key visual characteristics when present.
- Integrate it naturally into the campaign scene instead of loosely imitating it.` : ""}

Unique variation seed: ${data.seed}.`;

    try {
      const referenceImage = data.referenceImageUrl ? await fetchAsBase64(data.referenceImageUrl) : undefined;
      const { mimeType, base64 } = await callCloudflareImage(apiToken, accountId, fullPrompt, data.aspectRatio, data.seed, referenceImage, "generation", data.imageQuality);
      const url = await uploadToSupabaseStorage(base64, mimeType, "slide");
      return { dataUrl: `data:${mimeType};base64,${base64}`, url };
    } catch (error) {
      const err = error as Error;
      if (err.message) throw err;
      throw new Error(`Falha ao gerar imagem: ${String(error)}`);
    }
  });

export const testCloudflareConnection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ imageQuality: z.enum(["fast", "premium"]).optional().default("premium") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; model: string; dataUrl?: string }> => {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiToken) {
      return { ok: false, model: imageModelFor(data.imageQuality), message: "CLOUDFLARE_API_TOKEN não configurado no servidor." };
    }
    if (!accountId) {
      return { ok: false, model: imageModelFor(data.imageQuality), message: "CLOUDFLARE_ACCOUNT_ID não configurado no servidor." };
    }

    const model = imageModelFor(data.imageQuality);
    const testPrompt = `Create a polished square Instagram advertising visual, 1:1, dark premium background with subtle electric blue and violet lighting, one futuristic abstract AI object as the visual hero, professional editorial composition, realistic depth and clean negative space for later layout. No text, letters, numbers, logos, watermarks or UI.`;
    try {
      const { mimeType, base64 } = await callCloudflareImage(apiToken, accountId, testPrompt, "1:1", `test-${Date.now()}`, undefined, "test", data.imageQuality);
      return {
        ok: true,
        model,
        message: `Cloudflare Workers AI conectado e gerando imagens corretamente (${model}).`,
        dataUrl: `data:${mimeType};base64,${base64}`,
      };
    } catch (error) {
      const err = error as Error;
      return { ok: false, model: imageModelFor(data.imageQuality), message: err.message || "Falha desconhecida ao testar o Cloudflare Workers AI." };
    }
  });
