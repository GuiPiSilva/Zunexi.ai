import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { getPlanDefinition, normalizePlan, planHasFeature, type PlanFeature, type PlanId } from "@/lib/plans";

export type CreditStatus = {
  tenantId?: string;
  tenantName?: string;
  memberId?: string;
  memberRole?: "owner" | "admin" | "member" | "social" | "designer" | "approver" | "analyst" | "viewer" | "support";
  unlimited: boolean;
  plan: PlanId;
  planName: string;
  creditsPerMonth: number;
  usedThisMonth: number;
  remaining: number | null;
  resetAt: string;
  features: PlanFeature[];
  priorityGeneration: boolean;
};

export type CloudflareUsageDay = {
  date: string;
  neurons: number;
  images: number;
};

export type CloudflareUsageSummary = {
  setupRequired: boolean;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  percentage: number;
  imagesToday: number;
  averageNeuronsPerImage: number;
  estimatedImagesRemaining: number | null;
  resetsAt: string;
  model: string;
  history: CloudflareUsageDay[];
};

type AccessKeyRow = Database["public"]["Tables"]["access_keys"]["Row"];

export function admin() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function randomKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i += 1) out += chars[bytes[i] % chars.length];
  return `ZNX-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sessionSecret() {
  const value = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!value) throw new Error("ADMIN_SESSION_SECRET não configurado no servidor.");
  return value;
}

function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function checkAdmin(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Sessão administrativa inválida.");
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) throw new Error("Sessão administrativa inválida.");
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: string; exp?: number };
    if (parsed.role !== "admin" || !parsed.exp || parsed.exp < Date.now()) throw new Error();
  } catch {
    throw new Error("Sessão administrativa expirada. Entre novamente.");
  }
}

function brazilDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function currentMonthStart() {
  return `${brazilDate().slice(0, 7)}-01`;
}

function nextMonthStart() {
  const [year, month] = currentMonthStart().split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 10);
}

function statusFromRow(row: Partial<AccessKeyRow>): CreditStatus {
  const plan = normalizePlan(row.plan);
  const definition = getPlanDefinition(plan);
  const creditsPerMonth = Number(row.credits_per_month ?? definition.creditsPerMonth);
  const resetMonth = row.credits_reset_month || currentMonthStart();
  const usedThisMonth = resetMonth === currentMonthStart() ? Number(row.credits_used_month ?? 0) : 0;
  return {
    unlimited: Boolean(row.unlimited_credits),
    plan,
    planName: definition.name,
    creditsPerMonth,
    usedThisMonth,
    remaining: row.unlimited_credits ? null : Math.max(creditsPerMonth - usedThisMonth, 0),
    resetAt: nextMonthStart(),
    features: definition.features,
    priorityGeneration: planHasFeature(plan, "prioridade_geracao"),
  };
}

export async function requireAccessKey(sb: ReturnType<typeof admin>, key: string): Promise<AccessKeyRow> {
  const normalized = key.trim().toUpperCase();
  const { data: row, error } = await sb.from("access_keys").select("*").eq("key", normalized).maybeSingle();
  if (error) throw new Error(`Não foi possível validar a chave de acesso: ${error.message}`);
  if (!row || !row.active) throw new Error("Chave de acesso inválida ou desativada. Peça uma nova ao admin.");
  return row;
}

export type TenantContext = {
  access: AccessKeyRow & { tenant_id?: string | null };
  tenant: {
    id: string;
    name: string;
    plan: PlanId;
    credits_per_month: number;
    credits_used_month: number;
    credits_reset_month: string;
    unlimited_credits: boolean;
    active: boolean;
  };
  member: {
    id: string;
    display_name: string;
    role: "owner" | "admin" | "member" | "social" | "designer" | "approver" | "analyst" | "viewer" | "support";
    active: boolean;
  };
};

function tenantSlug(id: string) {
  return `tenant-${id.replace(/-/g, "")}`;
}

export async function requireTenantContext(sb: ReturnType<typeof admin>, key: string): Promise<TenantContext> {
  const access = await requireAccessKey(sb, key) as TenantContext["access"];
  let tenantId = access.tenant_id || null;

  if (!tenantId) {
    const definition = getPlanDefinition(access.plan);
    tenantId = access.id;
    const { error: tenantError } = await (sb as any).from("tenants").upsert({
      id: tenantId,
      name: access.label?.trim() || "Conta Zunexi.ai",
      slug: tenantSlug(tenantId),
      plan: normalizePlan(access.plan),
      credits_per_month: Number(access.credits_per_month ?? definition.creditsPerMonth),
      credits_used_month: Number(access.credits_used_month ?? 0),
      credits_reset_month: access.credits_reset_month || currentMonthStart(),
      unlimited_credits: Boolean(access.unlimited_credits),
      active: Boolean(access.active),
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (tenantError) throw new Error(`Execute a migração multi-tenant no Supabase: ${tenantError.message}`);
    const { error: keyError } = await (sb as any).from("access_keys").update({ tenant_id: tenantId }).eq("id", access.id);
    if (keyError) throw new Error(keyError.message);
    access.tenant_id = tenantId;
  }

  const { data: tenant, error: tenantError } = await (sb as any).from("tenants").select("*").eq("id", tenantId).maybeSingle();
  if (tenantError) throw new Error(`Não foi possível carregar a empresa: ${tenantError.message}`);
  if (!tenant || !tenant.active) throw new Error("A empresa vinculada a esta chave está desativada.");

  let { data: member, error: memberError } = await (sb as any).from("tenant_members").select("*").eq("access_key_id", access.id).maybeSingle();
  if (memberError) throw new Error(`Não foi possível carregar o usuário: ${memberError.message}`);
  if (!member) {
    const created = await (sb as any).from("tenant_members").insert({
      tenant_id: tenant.id,
      access_key_id: access.id,
      display_name: access.label?.trim() || "Usuário Zunexi.ai",
      role: "owner",
      active: true,
    }).select("*").single();
    if (created.error) throw new Error(created.error.message);
    member = created.data;
  }
  if (!member.active) throw new Error("Este usuário foi desativado pelo administrador da empresa.");

  return {
    access,
    tenant: { ...tenant, plan: normalizePlan(tenant.plan) },
    member,
  } as TenantContext;
}

function statusFromContext(context: TenantContext): CreditStatus {
  const definition = getPlanDefinition(context.tenant.plan);
  const resetMonth = context.tenant.credits_reset_month || currentMonthStart();
  const usedThisMonth = resetMonth === currentMonthStart() ? Number(context.tenant.credits_used_month || 0) : 0;
  const creditsPerMonth = Number(context.tenant.credits_per_month ?? definition.creditsPerMonth);
  return {
    tenantId: context.tenant.id,
    tenantName: context.tenant.name,
    memberId: context.member.id,
    memberRole: context.member.role,
    unlimited: Boolean(context.tenant.unlimited_credits),
    plan: context.tenant.plan,
    planName: definition.name,
    creditsPerMonth,
    usedThisMonth,
    remaining: context.tenant.unlimited_credits ? null : Math.max(creditsPerMonth - usedThisMonth, 0),
    resetAt: nextMonthStart(),
    features: definition.features,
    priorityGeneration: planHasFeature(context.tenant.plan, "prioridade_geracao"),
  };
}

export async function requirePlanFeature(sb: ReturnType<typeof admin>, key: string, feature: PlanFeature) {
  const context = await requireTenantContext(sb, key);
  if (!planHasFeature(context.tenant.plan, feature)) {
    const required = feature === "agenda" ? "Profissional ou Agência" : "um plano superior";
    throw new Error(`Este recurso está disponível somente no plano ${required}.`);
  }
  return context;
}

function normalizeCreditRpc(data: unknown): CreditStatus & { keyId: string } {
  const raw = (data || {}) as Record<string, unknown>;
  const plan = normalizePlan(raw.plan);
  const definition = getPlanDefinition(plan);
  const creditsPerMonth = Number(raw.creditsPerMonth ?? raw.creditsPerDay ?? definition.creditsPerMonth);
  const usedThisMonth = Number(raw.usedThisMonth ?? raw.usedToday ?? 0);
  const unlimited = Boolean(raw.unlimited);
  return {
    keyId: String(raw.keyId || ""),
    tenantId: raw.tenantId ? String(raw.tenantId) : undefined,
    tenantName: raw.tenantName ? String(raw.tenantName) : undefined,
    memberId: raw.memberId ? String(raw.memberId) : undefined,
    memberRole: ["owner", "admin", "member", "social", "designer", "approver", "analyst", "viewer", "support"].includes(String(raw.memberRole)) ? raw.memberRole as CreditStatus["memberRole"] : "member",
    unlimited,
    plan,
    planName: definition.name,
    creditsPerMonth,
    usedThisMonth,
    remaining: unlimited ? null : Number(raw.remaining ?? Math.max(creditsPerMonth - usedThisMonth, 0)),
    resetAt: String(raw.resetAt ?? raw.resetDate ?? nextMonthStart()),
    features: definition.features,
    priorityGeneration: planHasFeature(plan, "prioridade_geracao"),
  };
}

export async function consumeAccessCredit(sb: ReturnType<typeof admin>, key: string, jobId: string): Promise<CreditStatus & { keyId: string }> {
  const normalized = key.trim().toUpperCase();
  const response = await sb.rpc("consume_access_credit", { p_key: normalized, p_job_id: jobId });
  if (response.error && /function|schema cache|p_job_id|PGRST202/i.test(response.error.message)) {
    throw new Error("Execute a migração 6 de multi-tenant no Supabase antes de publicar esta versão.");
  }

  const { data, error } = response;
  if (error) {
    const details = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    if (details.includes("CREDITS_EXHAUSTED")) throw new Error("Seus créditos deste mês acabaram. Eles serão renovados automaticamente no próximo mês.");
    if (details.includes("INVALID_ACCESS_KEY")) throw new Error("Chave de acesso inválida ou desativada.");
    console.error("Erro ao consumir crédito", error);
    throw new Error(`Não foi possível verificar os créditos desta conta. ${details}`.trim());
  }
  return normalizeCreditRpc(data as Json);
}

export const getAccessCreditStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }): Promise<CreditStatus> => statusFromContext(await requireTenantContext(admin(), data.key)));

export const verifyAccessKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const sb = admin();
    try {
      const context = await requireTenantContext(sb, data.key);
      await sb.from("access_keys").update({ uses: (context.access.uses ?? 0) + 1, last_used_at: new Date().toISOString() }).eq("id", context.access.id);
      return {
        ok: true as const,
        keyId: context.access.id,
        tenantId: context.tenant.id,
        tenantName: context.tenant.name,
        memberId: context.member.id,
        role: context.member.role,
        name: context.member.display_name || context.access.label?.trim() || "Usuário Zunexi.ai",
        plan: context.tenant.plan,
        credits: statusFromContext(context),
      };
    } catch {
      return { ok: false as const };
    }
  });

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) throw new Error("ADMIN_PASSWORD não configurado no servidor.");
    if (!safeEqual(data.password, expected)) throw new Error("Senha administrativa inválida.");
    return { ok: true as const, token: createAdminToken() };
  });

export const adminListKeys = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20) }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const sb = admin();
    const { data: rows, error } = await (sb as any).from("access_keys").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const tenantIds = Array.from(new Set((rows ?? []).map((row: any) => row.tenant_id).filter(Boolean)));
    const keyIds = (rows ?? []).map((row: any) => row.id);
    const tenantsResult = tenantIds.length
      ? await (sb as any).from("tenants").select("id, name, plan, credits_per_month, credits_used_month, credits_reset_month, unlimited_credits, active").in("id", tenantIds)
      : { data: [], error: null };
    if (tenantsResult.error) throw new Error(tenantsResult.error.message);
    const membersResult = keyIds.length
      ? await (sb as any).from("tenant_members").select("id, tenant_id, access_key_id, display_name, role, active").in("access_key_id", keyIds)
      : { data: [], error: null };
    if (membersResult.error) throw new Error(membersResult.error.message);
    const tenants = new Map((tenantsResult.data ?? []).map((tenant: any) => [tenant.id, tenant]));
    const members = new Map((membersResult.data ?? []).map((member: any) => [member.access_key_id, member]));
    return (rows ?? []).map((row: any) => {
      const tenant = tenants.get(row.tenant_id) as any;
      const member = members.get(row.id) as any;
      return {
        ...row,
        tenant_name: tenant?.name ?? row.label ?? "Conta Zunexi.ai",
        tenant_plan: tenant?.plan ?? row.plan,
        tenant_active: tenant?.active ?? row.active,
        member_id: member?.id ?? null,
        member_role: member?.role ?? "owner",
        member_active: member?.active ?? row.active,
        display_name: member?.display_name ?? row.label,
        plan: tenant?.plan ?? row.plan,
        credits_per_month: tenant?.credits_per_month ?? row.credits_per_month,
        credits_used_month: tenant?.credits_used_month ?? row.credits_used_month,
        credits_reset_month: tenant?.credits_reset_month ?? row.credits_reset_month,
        unlimited_credits: tenant?.unlimited_credits ?? row.unlimited_credits,
      };
    });
  });

const CLOUDFLARE_FREE_NEURONS_PER_DAY = 10_000;
const CLOUDFLARE_FAST_IMAGE_MODEL = process.env.CLOUDFLARE_IMAGE_MODEL_FAST || process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";
const CLOUDFLARE_PREMIUM_IMAGE_MODEL = process.env.CLOUDFLARE_IMAGE_MODEL_PREMIUM || "@cf/black-forest-labs/flux-2-klein-9b";

function cloudflareModelLabel() {
  return CLOUDFLARE_FAST_IMAGE_MODEL === CLOUDFLARE_PREMIUM_IMAGE_MODEL
    ? CLOUDFLARE_FAST_IMAGE_MODEL
    : `Rápida: ${CLOUDFLARE_FAST_IMAGE_MODEL} · Premium: ${CLOUDFLARE_PREMIUM_IMAGE_MODEL}`;
}

function startOfUtcDay(date = new Date()) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function nextUtcReset(date = new Date()) {
  const value = startOfUtcDay(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function emptyCloudflareUsage(setupRequired = false): CloudflareUsageSummary {
  const now = new Date();
  const history: CloudflareUsageDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = startOfUtcDay(now);
    day.setUTCDate(day.getUTCDate() - offset);
    history.push({ date: day.toISOString().slice(0, 10), neurons: 0, images: 0 });
  }
  return {
    setupRequired,
    dailyLimit: CLOUDFLARE_FREE_NEURONS_PER_DAY,
    usedToday: 0,
    remainingToday: CLOUDFLARE_FREE_NEURONS_PER_DAY,
    percentage: 0,
    imagesToday: 0,
    averageNeuronsPerImage: 0,
    estimatedImagesRemaining: null,
    resetsAt: nextUtcReset(now).toISOString(),
    model: cloudflareModelLabel(),
    history,
  };
}

export const adminGetCloudflareUsage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20) }).parse(d))
  .handler(async ({ data }): Promise<CloudflareUsageSummary> => {
    checkAdmin(data.token);
    const sb = admin();
    const now = new Date();
    const historyStart = startOfUtcDay(now);
    historyStart.setUTCDate(historyStart.getUTCDate() - 6);

    const { data: events, error } = await sb
      .from("cloudflare_ai_usage")
      .select("created_at, estimated_neurons, source")
      .gte("created_at", historyStart.toISOString())
      .order("created_at", { ascending: true })
      .limit(20_000);

    if (error) {
      if (/cloudflare_ai_usage|relation .* does not exist|schema cache|PGRST205/i.test(error.message)) {
        return emptyCloudflareUsage(true);
      }
      throw new Error(`Não foi possível carregar o uso da Cloudflare: ${error.message}`);
    }

    const byDate = new Map<string, CloudflareUsageDay>();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = startOfUtcDay(now);
      day.setUTCDate(day.getUTCDate() - offset);
      const date = day.toISOString().slice(0, 10);
      byDate.set(date, { date, neurons: 0, images: 0 });
    }

    for (const event of events ?? []) {
      const date = new Date(event.created_at).toISOString().slice(0, 10);
      const bucket = byDate.get(date);
      if (!bucket) continue;
      bucket.neurons += Number(event.estimated_neurons || 0);
      bucket.images += 1;
    }

    const today = now.toISOString().slice(0, 10);
    const todayBucket = byDate.get(today) ?? { date: today, neurons: 0, images: 0 };
    const usedToday = Math.round(todayBucket.neurons * 100) / 100;
    const remainingToday = Math.max(CLOUDFLARE_FREE_NEURONS_PER_DAY - usedToday, 0);
    const averageNeuronsPerImage = todayBucket.images > 0
      ? Math.round((usedToday / todayBucket.images) * 100) / 100
      : 0;

    return {
      setupRequired: false,
      dailyLimit: CLOUDFLARE_FREE_NEURONS_PER_DAY,
      usedToday,
      remainingToday: Math.round(remainingToday * 100) / 100,
      percentage: Math.min(100, Math.round((usedToday / CLOUDFLARE_FREE_NEURONS_PER_DAY) * 10_000) / 100),
      imagesToday: todayBucket.images,
      averageNeuronsPerImage,
      estimatedImagesRemaining: averageNeuronsPerImage > 0 ? Math.floor(remainingToday / averageNeuronsPerImage) : null,
      resetsAt: nextUtcReset(now).toISOString(),
      model: cloudflareModelLabel(),
      history: Array.from(byDate.values()).map((item) => ({
        ...item,
        neurons: Math.round(item.neurons * 100) / 100,
      })),
    };
  });

export const adminCreateKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(20),
    label: z.string().trim().min(2, "Informe para quem a chave será criada.").max(120),
    plan: z.enum(["essencial", "profissional", "agencia"]),
    unlimited: z.boolean(),
    tenantId: z.string().uuid().optional().nullable(),
    tenantName: z.string().trim().min(2).max(160).optional(),
    role: z.enum(["owner", "admin", "member"]).optional().default("owner"),
  }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const sb = admin();
    let tenantId = data.tenantId || null;
    let actualPlan = data.plan;
    let actualUnlimited = data.unlimited;
    let tenantName = data.tenantName || data.label;

    if (!tenantId) {
      const id = randomUUID();
      const definition = getPlanDefinition(actualPlan);
      const { data: tenant, error } = await (sb as any).from("tenants").insert({
        id,
        name: tenantName,
        slug: tenantSlug(id),
        plan: actualPlan,
        credits_per_month: definition.creditsPerMonth,
        credits_used_month: 0,
        credits_reset_month: currentMonthStart(),
        unlimited_credits: actualUnlimited,
      }).select("*").single();
      if (error) throw new Error(error.message);
      tenantId = tenant.id;
      tenantName = tenant.name;
    } else {
      const { data: tenant, error } = await (sb as any).from("tenants").select("id, name, plan, unlimited_credits, active").eq("id", tenantId).single();
      if (error || !tenant) throw new Error("Empresa não encontrada.");
      if (!tenant.active) throw new Error("Esta empresa está desativada.");
      actualPlan = normalizePlan(tenant.plan);
      actualUnlimited = Boolean(tenant.unlimited_credits);
      tenantName = tenant.name;
    }

    const definition = getPlanDefinition(actualPlan);
    const key = randomKey();
    const { data: row, error } = await (sb as any)
      .from("access_keys")
      .insert({
        key,
        label: data.label,
        tenant_id: tenantId,
        plan: actualPlan,
        credits_per_month: definition.creditsPerMonth,
        credits_used_month: 0,
        credits_reset_month: currentMonthStart(),
        credits_per_day: definition.creditsPerMonth,
        unlimited_credits: actualUnlimited,
        credits_used_today: 0,
        credits_reset_date: brazilDate(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { data: member, error: memberError } = await (sb as any).from("tenant_members").insert({
      tenant_id: tenantId,
      access_key_id: row.id,
      display_name: data.label,
      role: data.role,
      active: true,
    }).select("*").single();
    if (memberError) {
      await (sb as any).from("access_keys").delete().eq("id", row.id);
      throw new Error(memberError.message);
    }
    return {
      ...row,
      tenant_name: tenantName,
      tenant_plan: actualPlan,
      tenant_active: true,
      member_id: member.id,
      member_role: member.role,
      member_active: member.active,
      display_name: member.display_name,
    };
  });

export const adminUpdatePlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(20),
    id: z.string().uuid(),
    plan: z.enum(["essencial", "profissional", "agencia"]),
    unlimited: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const sb = admin();
    const definition = getPlanDefinition(data.plan);
    const { data: keyRow, error: keyError } = await (sb as any).from("access_keys").select("*").eq("id", data.id).single();
    if (keyError) throw new Error(keyError.message);
    const tenantId = keyRow.tenant_id || keyRow.id;
    const { error: tenantError } = await (sb as any).from("tenants").update({
      plan: data.plan,
      credits_per_month: definition.creditsPerMonth,
      unlimited_credits: data.unlimited,
      updated_at: new Date().toISOString(),
    }).eq("id", tenantId);
    if (tenantError) throw new Error(tenantError.message);
    const { data: row, error } = await (sb as any).from("access_keys").update({
      plan: data.plan,
      credits_per_month: definition.creditsPerMonth,
      credits_per_day: definition.creditsPerMonth,
      unlimited_credits: data.unlimited,
    }).eq("tenant_id", tenantId).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    await (sb as any).from("access_keys").update({
      plan: data.plan,
      credits_per_month: definition.creditsPerMonth,
      credits_per_day: definition.creditsPerMonth,
      unlimited_credits: data.unlimited,
    }).eq("tenant_id", tenantId);
    return row;
  });

export const adminToggleKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20), id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const { error } = await admin().from("access_keys").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const sb = admin();
    const { data: keyRow, error: readError } = await (sb as any).from("access_keys").select("tenant_id").eq("id", data.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    const { error } = await (sb as any).from("access_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (keyRow?.tenant_id) {
      const { count } = await (sb as any).from("access_keys").select("id", { count: "exact", head: true }).eq("tenant_id", keyRow.tenant_id);
      if ((count ?? 0) === 0) await (sb as any).from("tenants").delete().eq("id", keyRow.tenant_id);
    }
    return { ok: true as const };
  });
