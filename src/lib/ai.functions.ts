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
// IMAGEM — Google Gemini 2.5 Flash Image ("Nano Banana"), chamada direto na
// API da Google (tier gratuito real, sem cartão). Antes isso passava pela
// Kie.ai, um revendedor pago que só dá um punhado de créditos de teste —
// por isso "batia limite grátis" rápido. Agora é direto na fonte.
//
// Como a Gemini só devolve a imagem em base64 (não uma URL hospedada), e o
// app persiste `url` no projeto pra não inchar o banco com base64 gigante,
// fazemos upload do resultado pro Supabase Storage (bucket "generated-images",
// precisa existir e ser público) e devolvemos a URL pública de lá.
// ---------------------------------------------------------------------------

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const GEMINI_IMAGE_TIMEOUT_MS = 60_000;
const GEMINI_STORAGE_BUCKET = process.env.GEMINI_STORAGE_BUCKET || "generated-images";
const GEMINI_MAX_ATTEMPTS = 4;
const GEMINI_BASE_DELAY_MS = 4_000;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato de imagem inválido.");
  return { mimeType: match[1], base64: match[2] };
}

async function uploadToSupabaseStorage(base64: string, mimeType: string, pathHint: string): Promise<string> {
  const sb = admin();
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const path = `${pathHint}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = Buffer.from(base64, "base64");

  const { error } = await sb.storage.from(GEMINI_STORAGE_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar imagem no Supabase Storage: ${error.message}`);

  const { data } = sb.storage.from(GEMINI_STORAGE_BUCKET).getPublicUrl(path);
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

async function callGeminiImage(
  apiKey: string,
  prompt: string,
  referenceImage?: { mimeType: string; base64: string },
): Promise<{ mimeType: string; base64: string }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_IMAGE_TIMEOUT_MS);

    try {
      const parts: Record<string, unknown>[] = [{ text: prompt }];
      if (referenceImage) {
        parts.unshift({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ contents: [{ role: "user", parts }] }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        console.error("Gemini Image error", response.status, `tentativa ${attempt}/${GEMINI_MAX_ATTEMPTS}`, body.slice(0, 500));

        if (response.status === 401 || response.status === 403) {
          throw new Error("Chave da Gemini inválida ou sem permissão para gerar imagens.");
        }
        if (response.status === 429 && attempt < GEMINI_MAX_ATTEMPTS) {
          await sleep(GEMINI_BASE_DELAY_MS * 2 ** (attempt - 1)); // 4s, 8s, 16s
          lastError = new Error("Limite gratuito da Gemini Image atingido no momento.");
          continue;
        }
        if (response.status === 429) {
          throw new Error("Limite gratuito da Gemini Image atingido. Aguarde um minuto e tente novamente.");
        }
        throw new Error(`Gemini Image retornou um erro (${response.status}). Tente novamente.`);
      }

      const json = (await response.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
      };
      const resultParts = json.candidates?.[0]?.content?.parts ?? [];
      const imagePart = resultParts.find((p) => p.inlineData?.data);
      if (!imagePart?.inlineData?.data) throw new Error("Imagem não retornada pela Gemini.");
      return { mimeType: imagePart.inlineData.mimeType || "image/png", base64: imagePart.inlineData.data };
    } catch (error) {
      const err = error as Error;
      if (err.name === "AbortError") {
        lastError = new Error("Tempo esgotado ao gerar imagem na Gemini.");
        if (attempt < GEMINI_MAX_ATTEMPTS) { await sleep(GEMINI_BASE_DELAY_MS); continue; }
        throw lastError;
      }
      if (!err.message?.includes("Limite gratuito")) throw err;
      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Falha ao gerar imagem após múltiplas tentativas.");
}

export const uploadReferenceImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReferenceImageInput.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada no servidor.");
    const { mimeType, base64 } = parseDataUrl(data.dataUrl);
    const url = await uploadToSupabaseStorage(base64, mimeType, "referencia");
    return { url };
  });

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }): Promise<{ dataUrl: string; url: string }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no servidor.");

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
- Use the attached image as the main visual reference for subject, product, logo, colors or composition.
- Preserve recognizable brand/product characteristics when present.
- Integrate it naturally into the final campaign artwork instead of merely placing it unchanged on the canvas.` : ""}

Unique variation seed: ${data.seed}.`;

    try {
      const referenceImage = data.referenceImageUrl ? await fetchAsBase64(data.referenceImageUrl) : undefined;
      const { mimeType, base64 } = await callGeminiImage(apiKey, fullPrompt, referenceImage);
      const url = await uploadToSupabaseStorage(base64, mimeType, "slide");
      return { dataUrl: `data:${mimeType};base64,${base64}`, url };
    } catch (error) {
      const err = error as Error;
      if (err.message) throw err;
      throw new Error(`Falha ao gerar imagem: ${String(error)}`);
    }
  });

export const testNanoBananaConnection = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; message: string; model: string; dataUrl?: string }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { ok: false, model: GEMINI_IMAGE_MODEL, message: "GEMINI_API_KEY não configurada no servidor." };
    }
    const testPrompt = `Create a polished square Instagram advertising test card, 1:1, dark premium background with subtle orange and gold lighting, one realistic gourmet burger as the hero product, professional editorial composition, clean safe margins. Render exactly this short Portuguese text: "NANO BANANA OK". Do not add any other words, prices, logos, watermarks or contact details.`;
    try {
      const { mimeType, base64 } = await callGeminiImage(apiKey, testPrompt);
      return {
        ok: true,
        model: GEMINI_IMAGE_MODEL,
        message: `Nano Banana conectado e gerando imagens corretamente (${GEMINI_IMAGE_MODEL}), direto na API da Google.`,
        dataUrl: `data:${mimeType};base64,${base64}`,
      };
    } catch (error) {
      const err = error as Error;
      return { ok: false, model: GEMINI_IMAGE_MODEL, message: err.message || "Falha desconhecida ao testar o Nano Banana." };
    }
  });
