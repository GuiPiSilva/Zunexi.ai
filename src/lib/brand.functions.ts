import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireAccessKey, requirePlanFeature } from "@/lib/access.functions";
import { normalizePlan } from "@/lib/plans";

const AccessInput = z.object({ accessKey: z.string().trim().min(4).max(64) });
const BrandPayload = z.object({
  name: z.string().trim().min(2).max(120),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  toneOfVoice: z.string().trim().max(400).default(""),
  audience: z.string().trim().max(400).default(""),
  visualStyle: z.string().trim().max(600).default(""),
  notes: z.string().trim().max(1500).default(""),
  isPrimary: z.boolean().default(false),
});

export const listBrandProfiles = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const access = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    const { data: rows, error } = await sb.from("brand_profiles").select("*").eq("access_key_id", access.id).order("is_primary", { ascending: false }).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { plan: normalizePlan(access.plan), brands: rows ?? [] };
  });

export const saveBrandProfile = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid().nullable().optional(), brand: BrandPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const access = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    const plan = normalizePlan(access.plan);

    if (!data.id && plan === "profissional") {
      const { count, error: countError } = await sb.from("brand_profiles").select("id", { count: "exact", head: true }).eq("access_key_id", access.id);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) >= 1) throw new Error("O plano Profissional permite um Brand Kit. O plano Agência permite múltiplas marcas.");
    }

    if (data.brand.isPrimary) {
      const { error } = await sb.from("brand_profiles").update({ is_primary: false }).eq("access_key_id", access.id);
      if (error) throw new Error(error.message);
    }

    const payload = {
      access_key_id: access.id,
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
      const { data: row, error } = await sb
        .from("brand_profiles")
        .update(payload)
        .eq("id", data.id)
        .eq("access_key_id", access.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: row, error } = await sb.from("brand_profiles").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteBrandProfile = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const access = await requirePlanFeature(sb, data.accessKey, "brand_kit");
    const { error } = await sb.from("brand_profiles").delete().eq("id", data.id).eq("access_key_id", access.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getPrimaryBrandProfile = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const access = await requireAccessKey(sb, data.accessKey);
    if (normalizePlan(access.plan) === "essencial") return null;
    const { data: primary, error } = await sb.from("brand_profiles").select("*").eq("access_key_id", access.id).eq("is_primary", true).maybeSingle();
    if (error && /brand_profiles|relation|schema cache|PGRST205/i.test(error.message)) return null;
    if (error) throw new Error(error.message);
    if (primary) return primary;
    const { data: first, error: firstError } = await sb.from("brand_profiles").select("*").eq("access_key_id", access.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (firstError && /brand_profiles|relation|schema cache|PGRST205/i.test(firstError.message)) return null;
    if (firstError) throw new Error(firstError.message);
    return first;
  });
