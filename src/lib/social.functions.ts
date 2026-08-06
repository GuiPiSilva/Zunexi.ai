import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requirePlanFeature, requireTenantContext, type TenantContext } from "@/lib/access.functions";
import { resolveBrandContext } from "@/lib/brand.functions";

const AccessInput = z.object({ accessKey: z.string().trim().min(4).max(64) });
const Platform = z.enum(["instagram", "facebook", "threads", "tiktok", "linkedin", "youtube", "pinterest", "x", "google_business", "outro"]);
const ContentStatus = z.enum(["rascunho", "em_revisao", "alteracoes", "aprovado", "agendado", "publicando", "publicado", "falhou", "arquivado"]);
const ContentType = z.enum(["carrossel", "cartaz", "reel", "story", "post", "video", "outro"]);
const ThreadStatus = z.enum(["novo", "em_atendimento", "aguardando", "resolvido", "spam"]);
const Sentiment = z.enum(["positive", "neutral", "negative", "urgent"]);
const AutomationType = z.enum(["publicar_aprovado", "responder_palavra", "alertar_reclamacao", "lembrar_aprovacao", "alertar_desempenho", "preencher_calendario"]);

const SocialAccountPayload = z.object({
  id: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  platform: Platform,
  accountName: z.string().trim().min(2).max(160),
  username: z.string().trim().max(160).default(""),
  externalAccountId: z.string().trim().max(240).default(""),
  pageId: z.string().trim().max(240).default(""),
  instagramBusinessAccountId: z.string().trim().max(240).default(""),
  accessToken: z.string().trim().max(10000).default(""),
  refreshToken: z.string().trim().max(10000).default(""),
  tokenExpiresAt: z.string().datetime().nullable().optional(),
  status: z.enum(["connected", "attention", "disconnected"]).default("connected"),
});

const ContentPayload = z.object({
  id: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  caption: z.string().trim().max(10000).default(""),
  contentType: ContentType.default("post"),
  status: ContentStatus.default("rascunho"),
  platforms: z.array(Platform).max(10).default([]),
  socialAccountIds: z.array(z.string().uuid()).max(20).default([]),
  mediaUrls: z.array(z.string().url()).max(20).default([]),
  projectId: z.string().trim().max(200).nullable().optional(),
  campaign: z.string().trim().max(180).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  scheduledFor: z.string().datetime().nullable().optional(),
});

const AutomationPayload = z.object({
  id: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(160),
  ruleType: AutomationType,
  active: z.boolean().default(true),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
});

const MANAGEMENT_FEATURE = "gestao_redes" as const;
const META_VERSION = (process.env.META_GRAPH_VERSION || "v26.0").replace(/^\//, "");
const META_GRAPH = `https://graph.facebook.com/${META_VERSION}`;

function tokenSecret() {
  const value = process.env.SOCIAL_TOKEN_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value || value.length < 24) throw new Error("SOCIAL_TOKEN_SECRET não configurada com segurança no servidor.");
  return createHash("sha256").update(value).digest();
}

function encryptSecret(value: string) {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value: string) {
  if (!value) return "";
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("Token social armazenado em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", tokenSecret(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function sanitizeAccount(row: any) {
  return {
    ...row,
    access_token_cipher: undefined,
    refresh_token_cipher: undefined,
    has_access_token: Boolean(row.access_token_cipher),
    has_refresh_token: Boolean(row.refresh_token_cipher),
  };
}

function managerRole(context: TenantContext) {
  return ["owner", "admin", "social"].includes(String(context.member.role));
}

function approvalRole(context: TenantContext) {
  return ["owner", "admin", "approver"].includes(String(context.member.role));
}

function requireManager(context: TenantContext) {
  if (!managerRole(context)) throw new Error("Seu perfil não tem permissão para gerenciar redes sociais.");
}

function requireApprover(context: TenantContext) {
  if (!approvalRole(context)) throw new Error("Seu perfil não tem permissão para aprovar conteúdos.");
}

function requireScheduler(context: TenantContext) {
  if (!managerRole(context) && !approvalRole(context)) throw new Error("Seu perfil não tem permissão para agendar conteúdos.");
}

function requireContentEditor(context: TenantContext) {
  if (!["owner", "admin", "member", "social", "designer"].includes(String(context.member.role))) {
    throw new Error("Seu perfil não tem permissão para editar conteúdos.");
  }
}

function requireInboxAgent(context: TenantContext) {
  if (!["owner", "admin", "member", "social", "support"].includes(String(context.member.role))) {
    throw new Error("Seu perfil não tem permissão para responder atendimentos.");
  }
}

async function validateBrand(sb: ReturnType<typeof admin>, context: TenantContext, brandId?: string | null) {
  if (!brandId) return null;
  const brand = await resolveBrandContext(sb, context, brandId);
  if (!brand) throw new Error("Marca não encontrada nesta empresa.");
  return brand.id;
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 25_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      const message = data?.error?.message || data?.message || data?.error_description || `HTTP ${response.status}`;
      throw new Error(String(message));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function metaPost(path: string, token: string, values: Record<string, string>) {
  const body = new URLSearchParams({ ...values, access_token: token });
  return fetchJson(`${META_GRAPH}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, 60_000);
}

async function testProviderConnection(row: any, token: string) {
  if (!token) throw new Error("Informe um token de acesso para testar a conexão.");
  const platform = String(row.platform);
  const id = String(row.external_account_id || row.instagram_business_account_id || row.page_id || "");

  if (platform === "instagram") {
    const accountId = String(row.instagram_business_account_id || row.external_account_id || "");
    if (!accountId) throw new Error("Informe o ID da conta profissional do Instagram.");
    return fetchJson(`${META_GRAPH}/${encodeURIComponent(accountId)}?fields=id,username,name,followers_count,media_count&access_token=${encodeURIComponent(token)}`);
  }
  if (platform === "facebook") {
    const pageId = String(row.page_id || row.external_account_id || "");
    if (!pageId) throw new Error("Informe o ID da Página do Facebook.");
    return fetchJson(`${META_GRAPH}/${encodeURIComponent(pageId)}?fields=id,name,username,fan_count,followers_count&access_token=${encodeURIComponent(token)}`);
  }
  if (platform === "threads") {
    return fetchJson(`https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(token)}`);
  }
  if (platform === "linkedin") {
    return fetchJson("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  }
  if (platform === "tiktok") {
    return fetchJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count", { headers: { Authorization: `Bearer ${token}` } });
  }
  if (platform === "youtube") {
    return fetchJson("https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true", { headers: { Authorization: `Bearer ${token}` } });
  }
  if (platform === "pinterest") {
    return fetchJson("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${token}` } });
  }
  if (platform === "x") {
    return fetchJson("https://api.x.com/2/users/me?user.fields=public_metrics,profile_image_url", { headers: { Authorization: `Bearer ${token}` } });
  }
  if (platform === "google_business") {
    return fetchJson("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!id) return { ok: true, note: "Conta manual registrada sem validação externa." };
  return { ok: true, id };
}

export const getSocialDashboardSummary = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const sevenDaysLater = new Date(now.getTime() + 7 * 86400000).toISOString();

    const [accounts, scheduled, review, inbox, metrics, recentContent] = await Promise.all([
      (sb as any).from("social_accounts").select("id,status", { count: "exact" }).eq("tenant_id", context.tenant.id),
      (sb as any).from("content_items").select("id", { count: "exact", head: true }).eq("tenant_id", context.tenant.id).in("status", ["aprovado", "agendado"]).lte("scheduled_for", sevenDaysLater),
      (sb as any).from("content_items").select("id", { count: "exact", head: true }).eq("tenant_id", context.tenant.id).in("status", ["em_revisao", "alteracoes"]),
      (sb as any).from("inbox_threads").select("id", { count: "exact", head: true }).eq("tenant_id", context.tenant.id).neq("status", "resolvido"),
      (sb as any).from("social_metrics").select("followers,reach,impressions,engagements,likes,comments,shares,saves,clicks,views,metric_date").eq("tenant_id", context.tenant.id).gte("metric_date", thirtyDaysAgo),
      (sb as any).from("content_items").select("id,title,status,platforms,scheduled_for,published_at,created_at").eq("tenant_id", context.tenant.id).order("updated_at", { ascending: false }).limit(5),
    ]);
    for (const result of [accounts, scheduled, review, inbox, metrics, recentContent]) if (result.error) throw new Error(result.error.message);
    const metricRows = metrics.data ?? [];
    const totals = metricRows.reduce((acc: any, row: any) => {
      for (const key of ["followers", "reach", "impressions", "engagements", "likes", "comments", "shares", "saves", "clicks", "views"]) acc[key] += Number(row[key] || 0);
      return acc;
    }, { followers: 0, reach: 0, impressions: 0, engagements: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, views: 0 });
    const connected = (accounts.data ?? []).filter((item: any) => item.status === "connected").length;
    return {
      connectedAccounts: connected,
      totalAccounts: accounts.count ?? (accounts.data ?? []).length,
      scheduledNext7Days: scheduled.count ?? 0,
      pendingReview: review.count ?? 0,
      openInbox: inbox.count ?? 0,
      metrics: totals,
      recentContent: recentContent.data ?? [],
    };
  });

export const listSocialAccounts = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    const { data: rows, error } = await (sb as any).from("social_accounts").select("*").eq("tenant_id", context.tenant.id).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(sanitizeAccount);
  });

export const saveSocialAccount = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ account: SocialAccountPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    requireManager(context);
    const brandId = await validateBrand(sb, context, data.account.brandId);
    let existing: any = null;
    if (data.account.id) {
      const found = await (sb as any).from("social_accounts").select("*").eq("id", data.account.id).eq("tenant_id", context.tenant.id).maybeSingle();
      if (found.error) throw new Error(found.error.message);
      if (!found.data) throw new Error("Conta social não encontrada.");
      existing = found.data;
    }
    const payload = {
      tenant_id: context.tenant.id,
      brand_profile_id: brandId,
      created_by_member_id: existing?.created_by_member_id || context.member.id,
      platform: data.account.platform,
      account_name: data.account.accountName,
      username: data.account.username,
      external_account_id: data.account.externalAccountId,
      page_id: data.account.pageId,
      instagram_business_account_id: data.account.instagramBusinessAccountId,
      status: data.account.accessToken || existing?.access_token_cipher ? data.account.status : "disconnected",
      access_token_cipher: data.account.accessToken ? encryptSecret(data.account.accessToken) : existing?.access_token_cipher || "",
      refresh_token_cipher: data.account.refreshToken ? encryptSecret(data.account.refreshToken) : existing?.refresh_token_cipher || "",
      token_expires_at: data.account.tokenExpiresAt || null,
      updated_at: new Date().toISOString(),
    };
    const query = data.account.id
      ? (sb as any).from("social_accounts").update(payload).eq("id", data.account.id).eq("tenant_id", context.tenant.id)
      : (sb as any).from("social_accounts").insert(payload);
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return sanitizeAccount(row);
  });

export const testSocialAccount = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    requireManager(context);
    const { data: row, error } = await (sb as any).from("social_accounts").select("*").eq("id", data.id).eq("tenant_id", context.tenant.id).single();
    if (error) throw new Error(error.message);
    try {
      const profile = await testProviderConnection(row, decryptSecret(row.access_token_cipher));
      const name = profile?.name || profile?.username || profile?.display_name || profile?.localized?.title || row.account_name;
      const { data: updated, error: updateError } = await (sb as any).from("social_accounts").update({
        account_name: String(name || row.account_name).slice(0, 160),
        status: "connected",
        metadata: { ...(row.metadata || {}), last_test: profile },
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("tenant_id", context.tenant.id).select("*").single();
      if (updateError) throw new Error(updateError.message);
      return { ok: true as const, account: sanitizeAccount(updated), profile };
    } catch (connectionError) {
      await (sb as any).from("social_accounts").update({ status: "attention", metadata: { ...(row.metadata || {}), last_error: connectionError instanceof Error ? connectionError.message : String(connectionError) }, updated_at: new Date().toISOString() }).eq("id", row.id).eq("tenant_id", context.tenant.id);
      throw connectionError;
    }
  });

export const deleteSocialAccount = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    requireManager(context);
    const { error } = await (sb as any).from("social_accounts").delete().eq("id", data.id).eq("tenant_id", context.tenant.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listContentItems = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ status: ContentStatus.optional(), brandId: z.string().uuid().optional().nullable(), limit: z.number().int().min(1).max(300).default(200) }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    let query = (sb as any).from("content_items").select("*").eq("tenant_id", context.tenant.id).order("updated_at", { ascending: false }).limit(data.limit);
    if (data.status) query = query.eq("status", data.status);
    if (data.brandId) query = query.eq("brand_profile_id", data.brandId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveContentItem = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ content: ContentPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    if (data.content.status === "agendado" && !data.content.scheduledFor) {
      throw new Error("Informe a data e o horário da publicação.");
    }
    if (data.content.status === "aprovado") requireApprover(context);
    else if (data.content.status === "agendado") requireScheduler(context);
    else requireContentEditor(context);
    const brandId = await validateBrand(sb, context, data.content.brandId);
    const payload: any = {
      tenant_id: context.tenant.id,
      brand_profile_id: brandId,
      owner_member_id: context.member.id,
      title: data.content.title,
      caption: data.content.caption,
      content_type: data.content.contentType,
      status: data.content.status,
      platforms: data.content.platforms,
      social_account_ids: data.content.socialAccountIds,
      media_urls: data.content.mediaUrls,
      project_id: data.content.projectId || null,
      campaign: data.content.campaign,
      tags: data.content.tags,
      scheduled_for: data.content.scheduledFor || null,
      updated_at: new Date().toISOString(),
    };
    if (["aprovado", "agendado"].includes(data.content.status)) {
      payload.approved_by_member_id = context.member.id;
      payload.approved_at = new Date().toISOString();
    }
    const query = data.content.id
      ? (sb as any).from("content_items").update(payload).eq("id", data.content.id).eq("tenant_id", context.tenant.id)
      : (sb as any).from("content_items").insert(payload);
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteContentItem = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    requireContentEditor(context);
    const { error } = await (sb as any).from("content_items").delete().eq("id", data.id).eq("tenant_id", context.tenant.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const changeContentStatus = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid(), status: ContentStatus, scheduledFor: z.string().datetime().nullable().optional() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    if (["aprovado", "alteracoes"].includes(data.status)) requireApprover(context);
    else if (data.status === "agendado") requireScheduler(context);
    else requireContentEditor(context);
    const updates: any = { status: data.status, updated_at: new Date().toISOString() };
    if (["aprovado", "agendado"].includes(data.status)) {
      updates.approved_by_member_id = context.member.id;
      updates.approved_at = new Date().toISOString();
    }
    if (data.status === "agendado") {
      if (!data.scheduledFor) throw new Error("Informe a data e o horário da publicação.");
      updates.scheduled_for = data.scheduledFor;
    }
    const { data: row, error } = await (sb as any).from("content_items").update(updates).eq("id", data.id).eq("tenant_id", context.tenant.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listContentComments = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ contentId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    const { data: rows, error } = await (sb as any).from("content_comments").select("*, tenant_members(display_name, role)").eq("tenant_id", context.tenant.id).eq("content_item_id", data.contentId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addContentComment = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ contentId: z.string().uuid(), body: z.string().trim().min(1).max(3000) }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    const exists = await (sb as any).from("content_items").select("id").eq("tenant_id", context.tenant.id).eq("id", data.contentId).maybeSingle();
    if (exists.error || !exists.data) throw new Error("Conteúdo não encontrado.");
    const { data: row, error } = await (sb as any).from("content_comments").insert({ tenant_id: context.tenant.id, content_item_id: data.contentId, member_id: context.member.id, body: data.body }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

async function resolvePublishingAccounts(sb: ReturnType<typeof admin>, tenantId: string, item: any) {
  const selected = stringArray(item.social_account_ids);
  let query = (sb as any).from("social_accounts").select("*").eq("tenant_id", tenantId).eq("status", "connected");
  if (selected.length) query = query.in("id", selected);
  else {
    const platforms = stringArray(item.platforms);
    if (platforms.length) query = query.in("platform", platforms);
    if (item.brand_profile_id) query = query.or(`brand_profile_id.eq.${item.brand_profile_id},brand_profile_id.is.null`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

function looksLikeVideo(url: string) {
  return /\.(mp4|mov|m4v|webm)(?:\?|$)/i.test(url);
}

async function publishInstagram(account: any, item: any, token: string) {
  const igId = account.instagram_business_account_id || account.external_account_id;
  if (!igId) throw new Error("A conta do Instagram não possui o ID profissional.");
  const media = stringArray(item.media_urls);
  if (!media.length) throw new Error("O Instagram exige uma imagem ou vídeo público para publicar.");
  let containerId = "";
  if (media.length > 1) {
    const children: string[] = [];
    for (const url of media.slice(0, 10)) {
      const child = await metaPost(`${igId}/media`, token, looksLikeVideo(url)
        ? { media_type: "VIDEO", video_url: url, is_carousel_item: "true" }
        : { image_url: url, is_carousel_item: "true" });
      if (!child.id) throw new Error("A Meta não retornou o ID de uma mídia do carrossel.");
      children.push(String(child.id));
    }
    const container = await metaPost(`${igId}/media`, token, { media_type: "CAROUSEL", children: children.join(","), caption: String(item.caption || "") });
    containerId = String(container.id || "");
  } else if (item.content_type === "reel" || item.content_type === "video" || looksLikeVideo(media[0])) {
    const container = await metaPost(`${igId}/media`, token, { media_type: "REELS", video_url: media[0], caption: String(item.caption || ""), share_to_feed: "true" });
    containerId = String(container.id || "");
  } else if (item.content_type === "story") {
    const container = await metaPost(`${igId}/media`, token, { media_type: "STORIES", image_url: media[0] });
    containerId = String(container.id || "");
  } else {
    const container = await metaPost(`${igId}/media`, token, { image_url: media[0], caption: String(item.caption || "") });
    containerId = String(container.id || "");
  }
  if (!containerId) throw new Error("A Meta não retornou o contêiner da publicação.");
  const published = await metaPost(`${igId}/media_publish`, token, { creation_id: containerId });
  return { platform: "instagram", accountId: account.id, externalId: published.id, status: "published" };
}

async function publishFacebook(account: any, item: any, token: string) {
  const pageId = account.page_id || account.external_account_id;
  if (!pageId) throw new Error("A conta do Facebook não possui o ID da Página.");
  const media = stringArray(item.media_urls);
  if (!media.length) {
    const post = await metaPost(`${pageId}/feed`, token, { message: String(item.caption || item.title || "") });
    return { platform: "facebook", accountId: account.id, externalId: post.id, status: "published" };
  }
  if (media.length === 1 && !looksLikeVideo(media[0])) {
    const post = await metaPost(`${pageId}/photos`, token, { url: media[0], caption: String(item.caption || "") });
    return { platform: "facebook", accountId: account.id, externalId: post.post_id || post.id, status: "published" };
  }
  if (media.length === 1 && looksLikeVideo(media[0])) {
    const post = await metaPost(`${pageId}/videos`, token, { file_url: media[0], description: String(item.caption || "") });
    return { platform: "facebook", accountId: account.id, externalId: post.id, status: "published" };
  }
  const attached: string[] = [];
  for (const url of media.slice(0, 10)) {
    if (looksLikeVideo(url)) throw new Error("Carrossel misto com vídeo no Facebook deve ser publicado manualmente nesta versão.");
    const photo = await metaPost(`${pageId}/photos`, token, { url, published: "false" });
    if (!photo.id) throw new Error("A Meta não retornou o ID de uma foto.");
    attached.push(String(photo.id));
  }
  const values: Record<string, string> = { message: String(item.caption || "") };
  attached.forEach((id, index) => { values[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id }); });
  const post = await metaPost(`${pageId}/feed`, token, values);
  return { platform: "facebook", accountId: account.id, externalId: post.id, status: "published" };
}

async function publishToAccount(account: any, item: any) {
  const token = decryptSecret(account.access_token_cipher);
  if (!token) throw new Error(`A conta ${account.account_name} não possui token de acesso.`);
  if (account.platform === "instagram") return publishInstagram(account, item, token);
  if (account.platform === "facebook") return publishFacebook(account, item, token);
  throw new Error(`A publicação automática para ${account.platform} ainda depende da aprovação e das credenciais oficiais dessa rede. Use o fluxo de exportação e marque como publicado manualmente.`);
}

export async function publishContentRecord(sb: ReturnType<typeof admin>, tenantId: string, itemId: string) {
  const { data: item, error } = await (sb as any).from("content_items").select("*").eq("tenant_id", tenantId).eq("id", itemId).single();
  if (error) throw new Error(error.message);
  if (!["aprovado", "agendado", "falhou"].includes(item.status)) throw new Error("O conteúdo precisa estar aprovado ou agendado antes de publicar.");
  const accounts = await resolvePublishingAccounts(sb, tenantId, item);
  if (!accounts.length) throw new Error("Nenhuma conta conectada foi encontrada para as plataformas selecionadas.");
  await (sb as any).from("content_items").update({ status: "publicando", error_message: "", updated_at: new Date().toISOString() }).eq("id", item.id).eq("tenant_id", tenantId);
  const results: any[] = [];
  const errors: string[] = [];
  for (const account of accounts) {
    try { results.push(await publishToAccount(account, item)); }
    catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : String(publishError);
      results.push({ platform: account.platform, accountId: account.id, status: "failed", error: message });
      errors.push(`${account.account_name}: ${message}`);
    }
  }
  const success = results.some((result) => result.status === "published");
  const finalStatus = success && errors.length === 0 ? "publicado" : success ? "publicado" : "falhou";
  const { data: updated, error: updateError } = await (sb as any).from("content_items").update({
    status: finalStatus,
    publish_results: results,
    published_at: success ? new Date().toISOString() : null,
    error_message: errors.join(" | "),
    updated_at: new Date().toISOString(),
  }).eq("id", item.id).eq("tenant_id", tenantId).select("*").single();
  if (updateError) throw new Error(updateError.message);
  if (!success) throw new Error(errors.join(" | ") || "A publicação falhou.");
  return updated;
}

export const publishContentNow = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    requireManager(context);
    return publishContentRecord(sb, context.tenant.id, data.id);
  });

export const markContentPublished = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, MANAGEMENT_FEATURE);
    requireManager(context);
    const { data: row, error } = await (sb as any).from("content_items").update({ status: "publicado", published_at: new Date().toISOString(), error_message: "", updated_at: new Date().toISOString() }).eq("id", data.id).eq("tenant_id", context.tenant.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listInboxThreads = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ status: ThreadStatus.optional(), query: z.string().trim().max(120).default("") }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "caixa_entrada" as any);
    let query = (sb as any).from("inbox_threads").select("*, social_accounts(account_name, platform)").eq("tenant_id", context.tenant.id).order("last_message_at", { ascending: false }).limit(300);
    if (data.status) query = query.eq("status", data.status);
    if (data.query) query = query.or(`user_name.ilike.%${data.query.replace(/[%_,]/g, "")}%,last_message.ilike.%${data.query.replace(/[%_,]/g, "")}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listInboxMessages = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ threadId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "caixa_entrada" as any);
    const thread = await (sb as any).from("inbox_threads").select("id").eq("tenant_id", context.tenant.id).eq("id", data.threadId).maybeSingle();
    if (thread.error || !thread.data) throw new Error("Conversa não encontrada.");
    const { data: rows, error } = await (sb as any).from("inbox_messages").select("*, tenant_members(display_name)").eq("tenant_id", context.tenant.id).eq("thread_id", data.threadId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    await (sb as any).from("inbox_threads").update({ unread_count: 0, updated_at: new Date().toISOString() }).eq("id", data.threadId).eq("tenant_id", context.tenant.id);
    return rows ?? [];
  });

export const updateInboxThread = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ threadId: z.string().uuid(), status: ThreadStatus.optional(), sentiment: Sentiment.optional(), assignedMemberId: z.string().uuid().nullable().optional(), labels: z.array(z.string().trim().min(1).max(40)).max(20).optional() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "caixa_entrada" as any);
    requireInboxAgent(context);
    const updates: any = { updated_at: new Date().toISOString() };
    if (data.status) updates.status = data.status;
    if (data.sentiment) updates.sentiment = data.sentiment;
    if (data.assignedMemberId !== undefined) updates.assigned_member_id = data.assignedMemberId;
    if (data.labels) updates.labels = data.labels;
    const { data: row, error } = await (sb as any).from("inbox_threads").update(updates).eq("id", data.threadId).eq("tenant_id", context.tenant.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

async function sendMetaReply(account: any, thread: any, body: string) {
  const token = decryptSecret(account.access_token_cipher);
  if (!token) throw new Error("A conta conectada não possui token de acesso.");
  const metadata = thread.metadata || {};
  if (thread.kind === "comment" && metadata.comment_id) {
    return metaPost(`${metadata.comment_id}/replies`, token, { message: body });
  }
  const accountId = account.platform === "instagram"
    ? account.instagram_business_account_id || account.external_account_id
    : account.page_id || account.external_account_id;
  if (!accountId || !thread.external_user_id) throw new Error("A conversa não possui os identificadores necessários para responder pela Meta.");
  return fetchJson(`${META_GRAPH}/${accountId}/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: thread.external_user_id }, messaging_type: "RESPONSE", message: { text: body } }),
  });
}

export const sendInboxReply = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ threadId: z.string().uuid(), body: z.string().trim().min(1).max(2000), internalNote: z.boolean().default(false) }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "caixa_entrada" as any);
    requireInboxAgent(context);
    const { data: thread, error } = await (sb as any).from("inbox_threads").select("*").eq("id", data.threadId).eq("tenant_id", context.tenant.id).single();
    if (error) throw new Error(error.message);
    let external: any = null;
    if (!data.internalNote) {
      if (!thread.social_account_id) throw new Error("Esta conversa não está ligada a uma conta conectada.");
      const accountResult = await (sb as any).from("social_accounts").select("*").eq("id", thread.social_account_id).eq("tenant_id", context.tenant.id).single();
      if (accountResult.error) throw new Error(accountResult.error.message);
      if (!["instagram", "facebook"].includes(accountResult.data.platform)) throw new Error("A resposta automática desta rede ainda depende do conector oficial. Use uma nota interna ou responda pela própria rede.");
      external = await sendMetaReply(accountResult.data, thread, data.body);
    }
    const { data: message, error: insertError } = await (sb as any).from("inbox_messages").insert({
      tenant_id: context.tenant.id,
      thread_id: thread.id,
      member_id: context.member.id,
      external_message_id: String(external?.message_id || external?.id || ""),
      direction: data.internalNote ? "note" : "outbound",
      body: data.body,
      delivery_status: data.internalNote ? "sent" : "sent",
      metadata: external || {},
    }).select("*").single();
    if (insertError) throw new Error(insertError.message);
    await (sb as any).from("inbox_threads").update({ status: data.internalNote ? thread.status : "aguardando", last_message: data.body, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", thread.id).eq("tenant_id", context.tenant.id);
    return message;
  });

async function syncMetaMetrics(sb: ReturnType<typeof admin>, account: any) {
  const token = decryptSecret(account.access_token_cipher);
  const today = new Date().toISOString().slice(0, 10);
  if (account.platform === "instagram") {
    const id = account.instagram_business_account_id || account.external_account_id;
    const profile = await fetchJson(`${META_GRAPH}/${id}?fields=id,username,followers_count,media_count&access_token=${encodeURIComponent(token)}`);
    return { metric_date: today, followers: Number(profile.followers_count || 0), metadata: { profile, media_count: profile.media_count || 0 } };
  }
  if (account.platform === "facebook") {
    const id = account.page_id || account.external_account_id;
    const profile = await fetchJson(`${META_GRAPH}/${id}?fields=id,name,fan_count,followers_count&access_token=${encodeURIComponent(token)}`);
    return { metric_date: today, followers: Number(profile.followers_count || profile.fan_count || 0), metadata: { profile } };
  }
  const profile = await testProviderConnection(account, token);
  const followers = Number(profile?.followers_count || profile?.statistics?.subscriberCount || profile?.data?.user?.follower_count || profile?.public_metrics?.followers_count || 0);
  return { metric_date: today, followers, metadata: { profile } };
}

export const syncSocialMetrics = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ accountId: z.string().uuid().optional().nullable() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "analytics" as any);
    requireManager(context);
    let query = (sb as any).from("social_accounts").select("*").eq("tenant_id", context.tenant.id).eq("status", "connected");
    if (data.accountId) query = query.eq("id", data.accountId);
    const accountsResult = await query;
    if (accountsResult.error) throw new Error(accountsResult.error.message);
    const results: any[] = [];
    for (const account of accountsResult.data ?? []) {
      try {
        const values = await syncMetaMetrics(sb, account);
        const record = {
          tenant_id: context.tenant.id,
          social_account_id: account.id,
          content_item_id: null,
          platform: account.platform,
          metric_date: values.metric_date,
          followers: values.followers,
          metadata: values.metadata,
          updated_at: new Date().toISOString(),
        };
        const existingMetric = await (sb as any).from("social_metrics").select("id").eq("tenant_id", context.tenant.id).eq("social_account_id", account.id).is("content_item_id", null).eq("metric_date", values.metric_date).maybeSingle();
        if (existingMetric.error) throw new Error(existingMetric.error.message);
        const writeMetric = existingMetric.data
          ? await (sb as any).from("social_metrics").update(record).eq("id", existingMetric.data.id).select("*").single()
          : await (sb as any).from("social_metrics").insert(record).select("*").single();
        if (writeMetric.error) throw new Error(writeMetric.error.message);
        await (sb as any).from("social_accounts").update({ last_sync_at: new Date().toISOString(), metadata: { ...(account.metadata || {}), last_sync_profile: values.metadata }, updated_at: new Date().toISOString() }).eq("id", account.id);
        results.push({ accountId: account.id, status: "success", metric: writeMetric.data });
      } catch (syncError) {
        results.push({ accountId: account.id, status: "failed", error: syncError instanceof Error ? syncError.message : String(syncError) });
      }
    }
    return results;
  });

export const listSocialMetrics = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ from: z.string().date(), to: z.string().date(), brandId: z.string().uuid().optional().nullable() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "analytics" as any);
    let accountIds: string[] | null = null;
    if (data.brandId) {
      const accounts = await (sb as any).from("social_accounts").select("id").eq("tenant_id", context.tenant.id).eq("brand_profile_id", data.brandId);
      if (accounts.error) throw new Error(accounts.error.message);
      const brandAccountIds = (accounts.data ?? []).map((row: any) => String(row.id));
      if (!brandAccountIds.length) return [];
      accountIds = brandAccountIds;
    }
    let query = (sb as any).from("social_metrics").select("*, social_accounts(account_name, username)").eq("tenant_id", context.tenant.id).gte("metric_date", data.from).lte("metric_date", data.to).order("metric_date", { ascending: true });
    if (accountIds) query = query.in("social_account_id", accountIds);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listListeningMentions = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ sentiment: Sentiment.optional(), limit: z.number().int().min(1).max(300).default(100) }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "social_listening" as any);
    let query = (sb as any).from("listening_mentions").select("*, social_accounts(account_name)").eq("tenant_id", context.tenant.id).order("occurred_at", { ascending: false }).limit(data.limit);
    if (data.sentiment) query = query.eq("sentiment", data.sentiment);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const generateAnalyticsInsight = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ from: z.string().date(), to: z.string().date() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "analytics" as any);
    const metrics = await (sb as any).from("social_metrics").select("platform,metric_date,followers,reach,impressions,engagements,likes,comments,shares,saves,clicks,views").eq("tenant_id", context.tenant.id).gte("metric_date", data.from).lte("metric_date", data.to).order("metric_date", { ascending: true });
    if (metrics.error) throw new Error(metrics.error.message);
    const content = await (sb as any).from("content_items").select("title,content_type,platforms,status,published_at,publish_results").eq("tenant_id", context.tenant.id).eq("status", "publicado").gte("published_at", `${data.from}T00:00:00.000Z`).lte("published_at", `${data.to}T23:59:59.999Z`).limit(100);
    if (content.error) throw new Error(content.error.message);
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      const totals = (metrics.data ?? []).reduce((acc: any, row: any) => {
        for (const key of ["reach", "impressions", "engagements", "likes", "comments", "shares", "saves", "clicks", "views"]) acc[key] += Number(row[key] || 0);
        return acc;
      }, { reach: 0, impressions: 0, engagements: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, views: 0 });
      return `No período, suas contas registraram ${totals.reach.toLocaleString("pt-BR")} de alcance e ${totals.engagements.toLocaleString("pt-BR")} interações. Configure a GROQ_API_KEY para receber recomendações estratégicas completas.`;
    }
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.25,
        messages: [
          { role: "system", content: "Você é o consultor de desempenho da Zunexi.ai. Analise somente os dados fornecidos. Escreva em português do Brasil um resumo direto com: o que melhorou, o que precisa de atenção e 3 ações práticas para os próximos 7 dias. Não invente percentuais nem causas sem evidência." },
          { role: "user", content: `Empresa: ${context.tenant.name}\nPeríodo: ${data.from} a ${data.to}\nMétricas: ${JSON.stringify(metrics.data ?? [])}\nConteúdos publicados: ${JSON.stringify(content.data ?? [])}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`A análise por IA falhou (${response.status}).`);
    const json = await response.json() as any;
    return String(json.choices?.[0]?.message?.content || "Não foi possível gerar a análise.").trim();
  });

export const listAutomationRules = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "automacoes" as any);
    const [rules, runs] = await Promise.all([
      (sb as any).from("automation_rules").select("*").eq("tenant_id", context.tenant.id).order("created_at", { ascending: false }),
      (sb as any).from("automation_runs").select("*").eq("tenant_id", context.tenant.id).order("created_at", { ascending: false }).limit(30),
    ]);
    if (rules.error) throw new Error(rules.error.message);
    if (runs.error) throw new Error(runs.error.message);
    return { rules: rules.data ?? [], runs: runs.data ?? [] };
  });

export const saveAutomationRule = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ rule: AutomationPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "automacoes" as any);
    requireManager(context);
    const brandId = await validateBrand(sb, context, data.rule.brandId);
    const payload = {
      tenant_id: context.tenant.id,
      brand_profile_id: brandId,
      created_by_member_id: context.member.id,
      name: data.rule.name,
      rule_type: data.rule.ruleType,
      active: data.rule.active,
      trigger_config: data.rule.triggerConfig,
      action_config: data.rule.actionConfig,
      updated_at: new Date().toISOString(),
    };
    const query = data.rule.id
      ? (sb as any).from("automation_rules").update(payload).eq("id", data.rule.id).eq("tenant_id", context.tenant.id)
      : (sb as any).from("automation_rules").insert(payload);
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAutomationRule = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "automacoes" as any);
    requireManager(context);
    const { error } = await (sb as any).from("automation_rules").delete().eq("id", data.id).eq("tenant_id", context.tenant.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function logAutomationRun(sb: ReturnType<typeof admin>, tenantId: string, ruleId: string | null, status: "success" | "skipped" | "failed", message: string, payload: any = {}) {
  await (sb as any).from("automation_runs").insert({ tenant_id: tenantId, automation_rule_id: ruleId, status, message, payload });
}

async function processDuePublications(sb: ReturnType<typeof admin>, tenantId: string, limit = 20) {
  const due = await (sb as any).from("content_items").select("id,title").eq("tenant_id", tenantId).eq("status", "agendado").lte("scheduled_for", new Date().toISOString()).order("scheduled_for", { ascending: true }).limit(limit);
  if (due.error) throw new Error(due.error.message);
  let published = 0;
  const failures: Array<{ contentId: string; title: string; error: string }> = [];
  for (const item of due.data ?? []) {
    try {
      await publishContentRecord(sb, tenantId, item.id);
      published += 1;
    } catch (error) {
      failures.push({ contentId: item.id, title: String(item.title || "Conteúdo"), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { due: (due.data ?? []).length, published, failures };
}

async function executeAutomationRule(sb: ReturnType<typeof admin>, tenantId: string, rule: any) {
  try {
    if (rule.rule_type === "publicar_aprovado") {
      const result = await processDuePublications(sb, tenantId);
      for (const failure of result.failures) {
        await logAutomationRun(sb, tenantId, rule.id, "failed", failure.error, { contentId: failure.contentId, title: failure.title });
      }
      await logAutomationRun(
        sb,
        tenantId,
        rule.id,
        result.due ? (result.published ? "success" : "failed") : "skipped",
        result.due ? `${result.published} de ${result.due} conteúdo(s) foram publicados.` : "Nenhum conteúdo agendado estava vencido.",
        result,
      );
    } else if (rule.rule_type === "alertar_reclamacao") {
      const since = new Date(Date.now() - 24 * 3600000).toISOString();
      const mentions = await (sb as any).from("listening_mentions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("sentiment", ["negative", "urgent"]).gte("occurred_at", since);
      if (mentions.error) throw new Error(mentions.error.message);
      await logAutomationRun(sb, tenantId, rule.id, (mentions.count ?? 0) ? "success" : "skipped", (mentions.count ?? 0) ? `${mentions.count} menção(ões) negativa(s) ou urgente(s) nas últimas 24 horas.` : "Nenhuma reclamação nova nas últimas 24 horas.");
    } else if (rule.rule_type === "lembrar_aprovacao") {
      const hours = Math.max(1, Number(rule.trigger_config?.hours || 24));
      const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
      const pending = await (sb as any).from("content_items").select("id,title").eq("tenant_id", tenantId).eq("status", "em_revisao").lte("updated_at", cutoff).limit(50);
      if (pending.error) throw new Error(pending.error.message);
      await logAutomationRun(sb, tenantId, rule.id, (pending.data ?? []).length ? "success" : "skipped", (pending.data ?? []).length ? `${pending.data.length} conteúdo(s) aguardam aprovação há mais de ${hours} horas.` : "Nenhuma aprovação atrasada.", { contentIds: (pending.data ?? []).map((item: any) => item.id) });
    } else if (rule.rule_type === "alertar_desempenho") {
      const threshold = Math.max(1, Number(rule.trigger_config?.engagements || 100));
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const metrics = await (sb as any).from("social_metrics").select("id,engagements,platform,metric_date").eq("tenant_id", tenantId).gte("metric_date", since).gte("engagements", threshold).order("engagements", { ascending: false }).limit(20);
      if (metrics.error) throw new Error(metrics.error.message);
      await logAutomationRun(sb, tenantId, rule.id, (metrics.data ?? []).length ? "success" : "skipped", (metrics.data ?? []).length ? `${metrics.data.length} registro(s) superaram ${threshold} interações.` : "Nenhum desempenho acima do limite configurado.", { metrics: metrics.data ?? [] });
    } else if (rule.rule_type === "preencher_calendario") {
      const minimum = Math.max(1, Number(rule.trigger_config?.minimum || 3));
      const until = new Date(Date.now() + 7 * 86400000).toISOString();
      const scheduled = await (sb as any).from("content_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["aprovado", "agendado"]).lte("scheduled_for", until).gte("scheduled_for", new Date().toISOString());
      if (scheduled.error) throw new Error(scheduled.error.message);
      const missing = Math.max(minimum - Number(scheduled.count || 0), 0);
      await logAutomationRun(sb, tenantId, rule.id, missing ? "success" : "skipped", missing ? `Seu calendário precisa de mais ${missing} conteúdo(s) nos próximos 7 dias.` : "O calendário já atingiu a quantidade mínima configurada.", { missing });
    } else if (rule.rule_type === "responder_palavra") {
      await logAutomationRun(sb, tenantId, rule.id, "skipped", "Esta regra é executada automaticamente quando uma nova mensagem chega pelo webhook.");
    }
    await (sb as any).from("automation_rules").update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", rule.id).eq("tenant_id", tenantId);
  } catch (error) {
    await logAutomationRun(sb, tenantId, rule.id, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export const runAutomationRule = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "automacoes" as any);
    requireManager(context);
    const { data: rule, error } = await (sb as any).from("automation_rules").select("*").eq("tenant_id", context.tenant.id).eq("id", data.id).single();
    if (error) throw new Error(error.message);
    await executeAutomationRule(sb, context.tenant.id, rule);
    return { ok: true as const };
  });

export async function processSocialCron(secret: string) {
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || !createHash("sha256").update(secret).digest().equals(createHash("sha256").update(expected).digest())) throw new Error("CRON_SECRET inválido.");
  const sb = admin();
  const tenants = await (sb as any).from("tenants").select("id").eq("active", true);
  if (tenants.error) throw new Error(tenants.error.message);
  const report: any[] = [];
  let published = 0;
  for (const tenant of tenants.data ?? []) {
    let dueResult: Awaited<ReturnType<typeof processDuePublications>> | null = null;
    try {
      dueResult = await processDuePublications(sb, tenant.id, 50);
      published += dueResult.published;
      for (const failure of dueResult.failures) report.push({ tenantId: tenant.id, contentId: failure.contentId, error: failure.error });
    } catch (error) {
      report.push({ tenantId: tenant.id, stage: "scheduled_publications", error: error instanceof Error ? error.message : String(error) });
    }

    const rules = await (sb as any).from("automation_rules").select("*").eq("tenant_id", tenant.id).eq("active", true);
    if (rules.error) { report.push({ tenantId: tenant.id, error: rules.error.message }); continue; }
    for (const rule of rules.data ?? []) {
      try {
        if (rule.rule_type === "publicar_aprovado" && dueResult) {
          await logAutomationRun(
            sb,
            tenant.id,
            rule.id,
            dueResult.due ? (dueResult.published ? "success" : "failed") : "skipped",
            dueResult.due ? `${dueResult.published} de ${dueResult.due} conteúdo(s) foram publicados pelo agendador.` : "Nenhum conteúdo agendado estava vencido.",
            dueResult,
          );
          await (sb as any).from("automation_rules").update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", rule.id).eq("tenant_id", tenant.id);
        } else {
          await executeAutomationRule(sb, tenant.id, rule);
        }
      } catch (error) {
        report.push({ tenantId: tenant.id, ruleId: rule.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { ok: true, processedTenants: (tenants.data ?? []).length, published, errors: report };
}

function detectSentiment(text: string): "positive" | "neutral" | "negative" | "urgent" {
  const value = text.toLowerCase();
  if (/urgente|processo|procon|reclama[cç][aã]o|fraude|golpe|cancelar agora|nunca chegou|péssim|horrível/.test(value)) return "urgent";
  if (/ruim|demora|atras|problema|erro|não funciona|nao funciona|insatisfeit/.test(value)) return "negative";
  if (/obrigad|amei|excelente|perfeito|ótimo|otimo|parabéns|parabens/.test(value)) return "positive";
  return "neutral";
}

async function runKeywordReplies(sb: ReturnType<typeof admin>, account: any, thread: any, inboundText: string) {
  const rules = await (sb as any).from("automation_rules").select("*").eq("tenant_id", account.tenant_id).eq("active", true).eq("rule_type", "responder_palavra");
  if (rules.error) return;
  for (const rule of rules.data ?? []) {
    const keywords = stringArray(rule.trigger_config?.keywords).map((item) => item.toLowerCase());
    const response = String(rule.action_config?.response || "").trim();
    if (!response || !keywords.some((keyword) => inboundText.toLowerCase().includes(keyword))) continue;
    try {
      if (["instagram", "facebook"].includes(account.platform)) {
        const external = await sendMetaReply(account, thread, response);
        await (sb as any).from("inbox_messages").insert({ tenant_id: account.tenant_id, thread_id: thread.id, direction: "outbound", external_message_id: String(external?.message_id || external?.id || ""), body: response, delivery_status: "sent", metadata: { automation_rule_id: rule.id } });
        await (sb as any).from("inbox_threads").update({ status: "aguardando", last_message: response, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", thread.id);
        await logAutomationRun(sb, account.tenant_id, rule.id, "success", "Resposta automática enviada.", { threadId: thread.id });
      }
    } catch (error) {
      await logAutomationRun(sb, account.tenant_id, rule.id, "failed", error instanceof Error ? error.message : String(error), { threadId: thread.id });
    }
  }
}

export function verifyMetaWebhookSignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && left.equals(right);
}

export async function ingestMetaWebhook(payload: any) {
  const sb = admin();
  const object = String(payload?.object || "");
  let inserted = 0;
  for (const entry of payload?.entry ?? []) {
    const entryId = String(entry?.id || "");
    const accountResult = await (sb as any).from("social_accounts").select("*").or(`external_account_id.eq.${entryId},page_id.eq.${entryId},instagram_business_account_id.eq.${entryId}`).in("platform", object === "instagram" ? ["instagram"] : ["facebook", "instagram"]).limit(1).maybeSingle();
    const account = accountResult.data;
    if (!account) continue;
    const events = [
      ...(entry?.messaging ?? []).map((event: any) => ({ type: "message", event })),
      ...(entry?.changes ?? []).map((event: any) => ({ type: event?.field || "change", event: event?.value || event })),
    ];
    for (const wrapper of events) {
      const event = wrapper.event || {};
      const message = event.message || event;
      const text = String(message.text || event.text || event.message || event.value?.text || "").trim();
      if (!text) continue;
      const senderId = String(event.sender?.id || event.from?.id || event.user_id || event.from?.username || event.id || "unknown");
      const externalMessageId = String(message.mid || event.id || event.comment_id || `${entryId}-${Date.now()}-${inserted}`);
      const kind = /comment/i.test(wrapper.type) || event.comment_id ? "comment" : /mention/i.test(wrapper.type) ? "mention" : "message";
      const threadKey = String(event.thread_id || event.parent_id || event.comment_id || senderId);
      const sentiment = detectSentiment(text);
      const currentThread = await (sb as any).from("inbox_threads").select("id,unread_count,status").eq("tenant_id", account.tenant_id).eq("social_account_id", account.id).eq("external_thread_id", threadKey).maybeSingle();
      const upsert = await (sb as any).from("inbox_threads").upsert({
        tenant_id: account.tenant_id,
        social_account_id: account.id,
        brand_profile_id: account.brand_profile_id,
        platform: account.platform,
        external_thread_id: threadKey,
        external_user_id: senderId,
        user_name: String(event.from?.name || event.from?.username || event.username || "Contato"),
        kind,
        status: currentThread.data?.status === "spam" ? "spam" : "novo",
        sentiment,
        last_message: text,
        last_message_at: new Date().toISOString(),
        unread_count: Number(currentThread.data?.unread_count || 0) + 1,
        metadata: { comment_id: event.comment_id || (kind === "comment" ? event.id : undefined), raw_type: wrapper.type },
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,social_account_id,external_thread_id" }).select("*").single();
      if (upsert.error) continue;
      const thread = upsert.data;
      const messageInsert = await (sb as any).from("inbox_messages").upsert({
        tenant_id: account.tenant_id,
        thread_id: thread.id,
        external_message_id: externalMessageId,
        direction: "inbound",
        body: text,
        delivery_status: "delivered",
        metadata: { raw_type: wrapper.type },
      }, { onConflict: "tenant_id,external_message_id", ignoreDuplicates: true });
      if (!messageInsert.error) inserted += 1;
      if (kind === "mention" || kind === "comment") {
        await (sb as any).from("listening_mentions").upsert({
          tenant_id: account.tenant_id,
          social_account_id: account.id,
          brand_profile_id: account.brand_profile_id,
          platform: account.platform,
          external_id: externalMessageId,
          author_name: thread.user_name,
          author_username: String(event.from?.username || ""),
          text,
          sentiment,
          mention_type: kind,
          occurred_at: new Date().toISOString(),
          metadata: { thread_id: thread.id },
        }, { onConflict: "tenant_id,platform,external_id", ignoreDuplicates: true });
      }
      await runKeywordReplies(sb, account, thread, text);
    }
  }
  return { ok: true, inserted };
}
