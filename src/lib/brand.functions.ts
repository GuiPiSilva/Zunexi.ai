import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { admin, requirePlanFeature, requireTenantContext, type TenantContext } from "@/lib/access.functions";
import { normalizePlan } from "@/lib/plans";

const AccessInput = z.object({ accessKey: z.string().trim().min(4).max(64) });
const BrandPayload = z.object({
  name: z.string().trim().min(2).max(120),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  toneOfVoice: z.string().trim().max(1200).default(""),
  audience: z.string().trim().max(1200).default(""),
  visualStyle: z.string().trim().max(2400).default(""),
  notes: z.string().trim().max(5000).default(""),
  isPrimary: z.boolean().default(false),
});

export type BrandContext = {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  toneOfVoice: string;
  audience: string;
  visualStyle: string;
  notes: string;
  typography: string[];
  contentPillars: string[];
  prohibitedTerms: string[];
  guideSummary: string;
  guideText: string;
};

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function toBrandContext(row: any): BrandContext {
  return {
    id: String(row.id),
    name: String(row.name || "Marca"),
    primaryColor: String(row.primary_color || "#4D6BFF"),
    secondaryColor: String(row.secondary_color || "#8B5CF6"),
    accentColor: String(row.accent_color || "#12C7FF"),
    toneOfVoice: String(row.tone_of_voice || ""),
    audience: String(row.audience || ""),
    visualStyle: String(row.visual_style || ""),
    notes: String(row.notes || ""),
    typography: asArray(row.typography),
    contentPillars: asArray(row.content_pillars),
    prohibitedTerms: asArray(row.prohibited_terms),
    guideSummary: String(row.guide_summary || ""),
    guideText: String(row.guide_text || ""),
  };
}

async function ensureBrandLimit(sb: ReturnType<typeof admin>, context: TenantContext, creating = true) {
  if (!creating) return;
  const plan = normalizePlan(context.tenant.plan);
  const { count, error } = await (sb as any).from("brand_profiles").select("id", { count: "exact", head: true }).eq("tenant_id", context.tenant.id);
  if (error) throw new Error(error.message);
  if (plan === "profissional" && (count ?? 0) >= 1) {
    throw new Error("O plano Profissional permite um Brand Kit. O plano Agência permite múltiplas marcas.");
  }
}

export async function resolveBrandContext(
  sb: ReturnType<typeof admin>,
  context: TenantContext,
  brandId?: string | null,
): Promise<BrandContext | null> {
  let query = (sb as any).from("brand_profiles").select("*").eq("tenant_id", context.tenant.id);
  if (brandId) query = query.eq("id", brandId);
  else query = query.order("is_primary", { ascending: false }).order("created_at", { ascending: true }).limit(1);
  const { data, error } = brandId ? await query.maybeSingle() : await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toBrandContext(data) : null;
}

export function brandContextAsPrompt(brand: BrandContext | null): string {
  if (!brand) return "Nenhum Brand Kit foi selecionado.";
  const guide = brand.guideText.slice(0, 12000);
  return `BRAND KIT OBRIGATÓRIO — aplique estas regras em 100% da criação:
Marca: ${brand.name}
Cores oficiais: ${brand.primaryColor}, ${brand.secondaryColor}, ${brand.accentColor}
Tipografia identificada: ${brand.typography.join(", ") || "não identificada"}
Tom de voz: ${brand.toneOfVoice || "não informado"}
Público-alvo: ${brand.audience || "não informado"}
Estilo visual: ${brand.visualStyle || "não informado"}
Pilares de conteúdo: ${brand.contentPillars.join("; ") || "não informados"}
Termos e abordagens proibidos: ${brand.prohibitedTerms.join("; ") || "nenhum informado"}
Observações: ${brand.notes || "nenhuma"}
Resumo do manual: ${brand.guideSummary || "não disponível"}
Trecho do manual PDF: ${guide || "não disponível"}
REGRA: quando o briefing do usuário conflitar com o manual da marca, preserve fatos fornecidos pelo usuário, mas mantenha cores, tom, tipografia, estilo e restrições do Brand Kit.`;
}

export const listBrandProfiles = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    const { data: rows, error } = await (sb as any).from("brand_profiles").select("*").eq("tenant_id", context.tenant.id).order("is_primary", { ascending: false }).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      plan: normalizePlan(context.tenant.plan),
      tenantId: context.tenant.id,
      tenantName: context.tenant.name,
      memberId: context.member.id,
      brands: rows ?? [],
    };
  });

export const saveBrandProfile = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid().nullable().optional(), brand: BrandPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    await ensureBrandLimit(sb, context, !data.id);

    if (data.brand.isPrimary) {
      const { error } = await (sb as any).from("brand_profiles").update({ is_primary: false }).eq("tenant_id", context.tenant.id);
      if (error) throw new Error(error.message);
    }

    const payload = {
      tenant_id: context.tenant.id,
      access_key_id: context.access.id,
      created_by_member_id: context.member.id,
      name: data.brand.name,
      primary_color: data.brand.primaryColor,
      secondary_color: data.brand.secondaryColor,
      accent_color: data.brand.accentColor,
      tone_of_voice: data.brand.toneOfVoice,
      audience: data.brand.audience,
      visual_style: data.brand.visualStyle,
      notes: data.brand.notes,
      is_primary: data.brand.isPrimary,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: row, error } = await (sb as any).from("brand_profiles").update(payload).eq("id", data.id).eq("tenant_id", context.tenant.id).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: row, error } = await (sb as any).from("brand_profiles").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteBrandProfile = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    const { data: docs } = await (sb as any).from("brand_documents").select("storage_path").eq("tenant_id", context.tenant.id).eq("brand_profile_id", data.id);
    for (const doc of docs ?? []) await sb.storage.from("brand-documents").remove([doc.storage_path]);
    const { error } = await (sb as any).from("brand_profiles").delete().eq("id", data.id).eq("tenant_id", context.tenant.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getPrimaryBrandProfile = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ brandId: z.string().uuid().optional().nullable() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    if (normalizePlan(context.tenant.plan) === "essencial") return null;
    const brand = await resolveBrandContext(sb, context, data.brandId);
    if (!brand) return null;
    const { data: row, error } = await (sb as any).from("brand_profiles").select("*").eq("tenant_id", context.tenant.id).eq("id", brand.id).single();
    if (error) throw new Error(error.message);
    return row;
  });

const PdfInput = AccessInput.extend({
  brandId: z.string().uuid().nullable().optional(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.literal("application/pdf"),
  base64: z.string().min(100),
});

function cleanJson(raw: string) {
  const text = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text) as Record<string, unknown>;
}

async function analyzeGuide(extractedText: string, fonts: string[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      name: "Marca importada",
      primaryColor: "#4D6BFF",
      secondaryColor: "#8B5CF6",
      accentColor: "#12C7FF",
      toneOfVoice: "",
      audience: "",
      visualStyle: "",
      notes: "Manual importado. Revise os campos antes de salvar.",
      contentPillars: [],
      prohibitedTerms: [],
      guideSummary: extractedText.slice(0, 1800),
    };
  }
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Analise um manual de identidade de marca. Retorne somente JSON com: name, primaryColor, secondaryColor, accentColor, toneOfVoice, audience, visualStyle, notes, contentPillars (array), prohibitedTerms (array), guideSummary. Cores devem ser HEX #RRGGBB. Não invente regras; quando ausentes use vazio. Resuma tipografia, composição, uso de logo, fotografia, ícones, linguagem, público, pilares e proibições.` },
        { role: "user", content: `Fontes detectadas: ${fonts.join(", ") || "nenhuma"}\n\nTexto do PDF:\n${extractedText.slice(0, 24000)}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Não foi possível analisar o PDF (${response.status}).`);
  const json = await response.json() as any;
  return cleanJson(String(json.choices?.[0]?.message?.content || "{}"));
}

async function ensureBucket(sb: ReturnType<typeof admin>) {
  const { data } = await sb.storage.getBucket("brand-documents");
  if (data) return;
  const { error } = await sb.storage.createBucket("brand-documents", {
    public: false,
    allowedMimeTypes: ["application/pdf"],
    fileSizeLimit: 15 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
}

export const uploadBrandGuidePdf = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => PdfInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    const buffer = Buffer.from(data.base64.replace(/^data:application\/pdf;base64,/, ""), "base64");
    if (buffer.byteLength > 15 * 1024 * 1024) throw new Error("O PDF deve ter no máximo 15 MB.");

    const { extractText, extractTextItems, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { maxImageSize: 16_777_216 });
    if (pdf.numPages > 100) throw new Error("O manual deve ter no máximo 100 páginas.");
    const extraction = Promise.all([
      extractText(pdf, { mergePages: true }),
      extractTextItems(pdf),
    ]);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("O PDF demorou demais para ser processado.")), 35_000));
    const [{ text, totalPages }, structured] = await Promise.race([extraction, timeout]);
    const extractedText = String(text || "").trim();
    if (extractedText.length < 40) throw new Error("Não foi possível ler texto suficiente deste PDF. Use um PDF com texto selecionável.");

    const fontCount = new Map<string, number>();
    for (const page of structured.items) for (const item of page) {
      const name = String(item.fontFamily || "").trim();
      if (name) fontCount.set(name, (fontCount.get(name) || 0) + 1);
    }
    const fonts = [...fontCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name]) => name);
    const analysis = await analyzeGuide(extractedText, fonts);

    let brandId = data.brandId || null;
    if (!brandId) {
      await ensureBrandLimit(sb, context, true);
      const { data: created, error } = await (sb as any).from("brand_profiles").insert({
        tenant_id: context.tenant.id,
        access_key_id: context.access.id,
        created_by_member_id: context.member.id,
        name: String(analysis.name || data.fileName.replace(/\.pdf$/i, "")),
        primary_color: /^#[0-9a-f]{6}$/i.test(String(analysis.primaryColor)) ? analysis.primaryColor : "#4D6BFF",
        secondary_color: /^#[0-9a-f]{6}$/i.test(String(analysis.secondaryColor)) ? analysis.secondaryColor : "#8B5CF6",
        accent_color: /^#[0-9a-f]{6}$/i.test(String(analysis.accentColor)) ? analysis.accentColor : "#12C7FF",
        tone_of_voice: String(analysis.toneOfVoice || ""),
        audience: String(analysis.audience || ""),
        visual_style: String(analysis.visualStyle || ""),
        notes: String(analysis.notes || ""),
        typography: fonts,
        content_pillars: asArray(analysis.contentPillars),
        prohibited_terms: asArray(analysis.prohibitedTerms),
        guide_summary: String(analysis.guideSummary || ""),
        guide_text: extractedText.slice(0, 50000),
        guide_updated_at: new Date().toISOString(),
        is_primary: true,
      }).select("*").single();
      if (error) throw new Error(error.message);
      brandId = created.id;
    } else {
      const existing = await resolveBrandContext(sb, context, brandId);
      if (!existing) throw new Error("Marca não encontrada nesta empresa.");
      const { error } = await (sb as any).from("brand_profiles").update({
        name: String(analysis.name || existing.name),
        primary_color: /^#[0-9a-f]{6}$/i.test(String(analysis.primaryColor)) ? analysis.primaryColor : existing.primaryColor,
        secondary_color: /^#[0-9a-f]{6}$/i.test(String(analysis.secondaryColor)) ? analysis.secondaryColor : existing.secondaryColor,
        accent_color: /^#[0-9a-f]{6}$/i.test(String(analysis.accentColor)) ? analysis.accentColor : existing.accentColor,
        tone_of_voice: String(analysis.toneOfVoice || existing.toneOfVoice),
        audience: String(analysis.audience || existing.audience),
        visual_style: String(analysis.visualStyle || existing.visualStyle),
        notes: String(analysis.notes || existing.notes),
        typography: fonts,
        content_pillars: asArray(analysis.contentPillars),
        prohibited_terms: asArray(analysis.prohibitedTerms),
        guide_summary: String(analysis.guideSummary || ""),
        guide_text: extractedText.slice(0, 50000),
        guide_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", brandId).eq("tenant_id", context.tenant.id);
      if (error) throw new Error(error.message);
    }

    await ensureBucket(sb);
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
    const storagePath = `${context.tenant.id}/${brandId}/${randomUUID()}-${safeName}`;
    const { error: uploadError } = await sb.storage.from("brand-documents").upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const extractedData = { ...analysis, typography: fonts };
    const { error: docError } = await (sb as any).from("brand_documents").insert({
      tenant_id: context.tenant.id,
      brand_profile_id: brandId,
      uploaded_by_member_id: context.member.id,
      file_name: data.fileName,
      storage_path: storagePath,
      mime_type: data.mimeType,
      size_bytes: buffer.byteLength,
      page_count: totalPages,
      extracted_text: extractedText.slice(0, 50000),
      extracted_data: extractedData,
    });
    if (docError) throw new Error(docError.message);

    const { data: brand, error: brandError } = await (sb as any).from("brand_profiles").select("*").eq("id", brandId).eq("tenant_id", context.tenant.id).single();
    if (brandError) throw new Error(brandError.message);
    return { brand, totalPages, fonts, summary: String(analysis.guideSummary || "") };
  });

export const listBrandDocuments = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ brandId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    const { data: rows, error } = await (sb as any).from("brand_documents").select("id,file_name,size_bytes,page_count,created_at").eq("tenant_id", context.tenant.id).eq("brand_profile_id", data.brandId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
