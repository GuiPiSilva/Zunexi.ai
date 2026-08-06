import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requirePlanFeature } from "@/lib/access.functions";

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
  notes: z.string().trim().max(2000).default(""),
});

export type ScheduledPostInput = z.infer<typeof ScheduledPostPayload>;

export const listScheduledPosts = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const access = await requirePlanFeature(sb, data.accessKey, "agenda");
    const { data: rows, error } = await sb
      .from("scheduled_posts")
      .select("*")
      .eq("access_key_id", access.id)
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
    const access = await requirePlanFeature(sb, data.accessKey, "agenda");
    const { data: row, error } = await sb
      .from("scheduled_posts")
      .insert({
        access_key_id: access.id,
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
    const access = await requirePlanFeature(sb, data.accessKey, "agenda");
    const { data: row, error } = await sb
      .from("scheduled_posts")
      .update({
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
      .eq("access_key_id", access.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteScheduledPost = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const access = await requirePlanFeature(sb, data.accessKey, "agenda");
    const { error } = await sb.from("scheduled_posts").delete().eq("id", data.id).eq("access_key_id", access.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
