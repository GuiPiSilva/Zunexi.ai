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
// IMAGEM — Hugging Face / NVIDIA Qwen-Image-Flash.
//
// O modelo gera somente o visual-base. O texto final continua sendo aplicado
// pela Zunexi no navegador para evitar erros de ortografia e manter o layout
// previsível. Se o checkpoint ainda não estiver servido pelo provider
// hf-inference, configure HUGGINGFACE_IMAGE_ENDPOINT com um Inference Endpoint
// dedicado que aceite o payload padrão de text-to-image do Hugging Face.
// ---------------------------------------------------------------------------

const HUGGINGFACE_IMAGE_MODEL = process.env.HUGGINGFACE_IMAGE_MODEL || "nvidia/Qwen-Image-Flash";
const HUGGINGFACE_IMAGE_TIMEOUT_MS = 120_000;
const HUGGINGFACE_MAX_ATTEMPTS = 3;
const HUGGINGFACE_BASE_DELAY_MS = 2_000;
const IMAGE_STORAGE_BUCKET = process.env.IMAGE_STORAGE_BUCKET || process.env.GEMINI_STORAGE_BUCKET || "generated-images";

type ImageQuality = "fast" | "premium";

function imageModelFor(_quality: ImageQuality = "premium") {
  return HUGGINGFACE_IMAGE_MODEL;
}

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
  // Mantido por compatibilidade com projetos/jobs antigos. Qwen-Image-Flash
  // usa o mesmo checkpoint em ambos os valores.
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
  const maxChars = 6_000;
  if (normalized.length <= maxChars) return normalized;
  const head = normalized.slice(0, 3_600);
  const tail = normalized.slice(-2_200);
  return `${head}\n\n[brief compacted]\n\n${tail}`;
}

function dimensionsForAspectRatio(aspectRatio: "1:1" | "4:5" | "9:16") {
  if (aspectRatio === "4:5") return { width: 1024, height: 1280 };
  if (aspectRatio === "9:16") return { width: 720, height: 1280 };
  return { width: 1024, height: 1024 };
}

function huggingFaceEndpoint() {
  const custom = process.env.HUGGINGFACE_IMAGE_ENDPOINT?.trim();
  if (custom) return custom.replace(/\/$/, "");
  return `https://router.huggingface.co/hf-inference/models/${HUGGINGFACE_IMAGE_MODEL}`;
}

function huggingFaceErrorDetail(body: string): string {
  if (!body) return "resposta vazia";
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string };
      message?: string;
      estimated_time?: number;
    };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    if (parsed.error && typeof parsed.error === "object" && parsed.error.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
    if (parsed.estimated_time) return `modelo inicializando; estimativa ${Math.ceil(parsed.estimated_time)}s`;
  } catch {
    // Pode ser texto simples; retornamos um trecho seguro abaixo.
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 320) || "erro desconhecido";
}

async function callHuggingFaceImage(
  token: string,
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "9:16",
  seed: string,
): Promise<{ mimeType: string; base64: string }> {
  const endpoint = huggingFaceEndpoint();
  const { width, height } = dimensionsForAspectRatio(aspectRatio);
  let lastError: Error | null = null;
  let requestPrompt = compactImagePrompt(prompt);

  for (let attempt = 1; attempt <= HUGGINGFACE_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HUGGINGFACE_IMAGE_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "image/*, application/json",
          "x-wait-for-model": "true",
        },
        signal: controller.signal,
        body: JSON.stringify({
          inputs: requestPrompt,
          parameters: {
            width,
            height,
            // Qwen-Image-Flash foi destilado para quatro passos.
            num_inference_steps: 4,
            seed: imageSeed(seed),
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        const detail = huggingFaceErrorDetail(body);
        console.error("Hugging Face image error", response.status, `tentativa ${attempt}/${HUGGINGFACE_MAX_ATTEMPTS}`, detail);

        if (response.status === 401 || response.status === 403) {
          throw new Error(`Hugging Face recusou o token/permissão (${response.status}): ${detail}`);
        }
        if (response.status === 404 || response.status === 410) {
          throw new Error(
            `O modelo ${HUGGINGFACE_IMAGE_MODEL} não está disponível nesta rota do Hugging Face. ` +
            `Configure HUGGINGFACE_IMAGE_ENDPOINT com um Inference Endpoint do Qwen-Image-Flash. Detalhe: ${detail}`,
          );
        }
        if (response.status === 400 && attempt < HUGGINGFACE_MAX_ATTEMPTS && requestPrompt.length > 3_500) {
          requestPrompt = requestPrompt.slice(0, 3_500);
          lastError = new Error(`Hugging Face rejeitou o briefing: ${detail}`);
          await sleep(500);
          continue;
        }
        if ((response.status === 429 || response.status >= 500) && attempt < HUGGINGFACE_MAX_ATTEMPTS) {
          lastError = new Error(`Hugging Face indisponível/limitado (${response.status}): ${detail}`);
          await sleep(HUGGINGFACE_BASE_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`Hugging Face retornou erro ${response.status}: ${detail}`);
      }

      const responseType = (response.headers.get("content-type") || "").split(";")[0];
      if (responseType.startsWith("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return { mimeType: responseType, base64: buffer.toString("base64") };
      }

      const body = Buffer.from(await response.arrayBuffer());
      const text = body.toString("utf8");
      try {
        const parsed = JSON.parse(text) as { image?: string; generated_image?: string; error?: string };
        const base64 = parsed.image || parsed.generated_image;
        if (base64) return { mimeType: "image/png", base64 };
        if (parsed.error) throw new Error(parsed.error);
      } catch (error) {
        if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
      }
      throw new Error(`O Hugging Face não retornou bytes de imagem válidos. Resposta: ${text.slice(0, 220)}`);
    } catch (error) {
      const err = error as Error;
      if (err.name === "AbortError") {
        lastError = new Error("Tempo esgotado ao gerar imagem no Hugging Face.");
        if (attempt < HUGGINGFACE_MAX_ATTEMPTS) {
          await sleep(HUGGINGFACE_BASE_DELAY_MS);
          continue;
        }
        throw lastError;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Falha ao gerar imagem no Hugging Face após múltiplas tentativas.");
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
  .handler(async ({ data }): Promise<{ dataUrl: string; url: string }> => {
    const apiToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN;
    if (!apiToken) throw new Error("HF_TOKEN não configurado no servidor.");

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

    try {
      const { mimeType, base64 } = await callHuggingFaceImage(apiToken, fullPrompt, data.aspectRatio, data.seed);
      const url = await uploadToSupabaseStorage(base64, mimeType, "slide");
      return { dataUrl: `data:${mimeType};base64,${base64}`, url };
    } catch (error) {
      const err = error as Error;
      if (err.message) throw err;
      throw new Error(`Falha ao gerar imagem: ${String(error)}`);
    }
  });

export const testHuggingFaceConnection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ imageQuality: z.enum(["fast", "premium"]).optional().default("premium") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; model: string; dataUrl?: string }> => {
    const apiToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN;
    const model = imageModelFor(data.imageQuality);
    if (!apiToken) {
      return { ok: false, model, message: "HF_TOKEN não configurado no servidor." };
    }

    const testPrompt = `Premium square AI technology campaign visual, deep black background, electric blue and violet luminous particles, one sculptural futuristic abstract object as hero, dramatic editorial lighting, realistic depth, elegant negative space. No text, letters, numbers, logos, watermark or UI.`;
    try {
      const { mimeType, base64 } = await callHuggingFaceImage(apiToken, testPrompt, "1:1", `test-${Date.now()}`);
      return {
        ok: true,
        model,
        message: `Hugging Face conectado e gerando imagens com ${model}.`,
        dataUrl: `data:${mimeType};base64,${base64}`,
      };
    } catch (error) {
      const err = error as Error;
      return { ok: false, model, message: err.message || "Falha desconhecida ao testar o Hugging Face." };
    }
  });
