import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requirePlanFeature } from "@/lib/access.functions";
import { resolveBrandContext } from "@/lib/brand.functions";

const AccessInput = z.object({ accessKey: z.string().trim().min(4).max(64) });
const PostStatus = z.enum(["rascunho", "agendado", "publicado"]);
const Platform = z.enum(["instagram", "facebook", "linkedin", "tiktok", "outro"]);
const ContentType = z.enum(["carrossel", "cartaz", "reel", "story", "post", "outro"]);

const ScheduledPostPayload = z.object({
  title: z.string().trim().min(2).max(160),
  caption: z.string().trim().max(4000).default(""),
  platform: Platform.default("instagram"),
  contentType: ContentType.default("post"),
  scheduledFor: z.string().datetime(),
  status: PostStatus.default("agendado"),
  projectId: z.string().trim().max(160).nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).default(""),
});

export type ScheduledPostInput = z.infer<typeof ScheduledPostPayload>;

async function validateBrand(sb: ReturnType<typeof admin>, context: Awaited<ReturnType<typeof requirePlanFeature>>, brandId?: string | null) {
  if (!brandId) return null;
  const brand = await resolveBrandContext(sb, context, brandId);
  if (!brand) throw new Error("Marca não encontrada nesta empresa.");
  return brand.id;
}

export const listScheduledPosts = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ from: z.string().datetime(), to: z.string().datetime() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "agenda");
    const { data: rows, error } = await (sb as any)
      .from("scheduled_posts")
      .select("*")
      .eq("tenant_id", context.tenant.id)
      .eq("owner_member_id", context.member.id)
      .gte("scheduled_for", data.from)
      .lt("scheduled_for", data.to)
      .order("scheduled_for", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createScheduledPost = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ post: ScheduledPostPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "agenda");
    const brandId = await validateBrand(sb, context, data.post.brandId);
    const { data: row, error } = await (sb as any)
      .from("scheduled_posts")
      .insert({
        access_key_id: context.access.id,
        tenant_id: context.tenant.id,
        owner_member_id: context.member.id,
        brand_profile_id: brandId,
        title: data.post.title,
        caption: data.post.caption,
        platform: data.post.platform,
        content_type: data.post.contentType,
        scheduled_for: data.post.scheduledFor,
        status: data.post.status,
        project_id: data.post.projectId || null,
        notes: data.post.notes,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateScheduledPost = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid(), post: ScheduledPostPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "agenda");
    const brandId = await validateBrand(sb, context, data.post.brandId);
    const { data: row, error } = await (sb as any)
      .from("scheduled_posts")
      .update({
        brand_profile_id: brandId,
        title: data.post.title,
        caption: data.post.caption,
        platform: data.post.platform,
        content_type: data.post.contentType,
        scheduled_for: data.post.scheduledFor,
        status: data.post.status,
        project_id: data.post.projectId || null,
        notes: data.post.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("tenant_id", context.tenant.id)
      .eq("owner_member_id", context.member.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteScheduledPost = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "agenda");
    const { error } = await (sb as any).from("scheduled_posts").delete().eq("id", data.id).eq("tenant_id", context.tenant.id).eq("owner_member_id", context.member.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
