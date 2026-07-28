import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type CreditStatus = {
  unlimited: boolean;
  creditsPerDay: number;
  usedToday: number;
  remaining: number | null;
  resetDate: string;
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
  return `INL-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
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

function statusFromRow(row: Pick<AccessKeyRow, "unlimited_credits" | "credits_per_day" | "credits_used_today" | "credits_reset_date">): CreditStatus {
  const usedToday = row.credits_reset_date === brazilDate() ? row.credits_used_today : 0;
  return {
    unlimited: row.unlimited_credits,
    creditsPerDay: row.credits_per_day,
    usedToday,
    remaining: row.unlimited_credits ? null : Math.max(row.credits_per_day - usedToday, 0),
    resetDate: row.credits_reset_date,
  };
}

export async function requireAccessKey(sb: ReturnType<typeof admin>, key: string) {
  const normalized = key.trim().toUpperCase();
  const { data: row } = await sb
    .from("access_keys")
    .select("id, active, label, unlimited_credits, credits_per_day, credits_used_today, credits_reset_date")
    .eq("key", normalized)
    .maybeSingle();
  if (!row || !row.active) throw new Error("Chave de acesso inválida ou desativada. Peça uma nova ao admin.");
  return row;
}

export async function consumeAccessCredit(sb: ReturnType<typeof admin>, key: string, jobId: string): Promise<CreditStatus & { keyId: string }> {
  const normalized = key.trim().toUpperCase();
  let response = await sb.rpc("consume_access_credit", { p_key: normalized, p_job_id: jobId });

  // Compatibilidade temporária quando o cache de esquema do Supabase ainda enxerga
  // a versão antiga da função, com somente o argumento p_key.
  if (response.error && /function|schema cache|p_job_id|PGRST202/i.test(response.error.message)) {
    const legacy = await (sb as any).rpc("consume_access_credit", { p_key: normalized });
    if (!legacy.error) response = legacy;
  }

  const { data, error } = response;
  if (error) {
    const details = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    if (details.includes("CREDITS_EXHAUSTED")) throw new Error("Seus créditos de hoje acabaram. Eles serão renovados automaticamente amanhã.");
    if (details.includes("INVALID_ACCESS_KEY")) throw new Error("Chave de acesso inválida ou desativada.");
    console.error("Erro ao consumir crédito", error);
    throw new Error(`Não foi possível verificar os créditos desta conta. ${details}`.trim());
  }
  const result = data as Json as unknown as CreditStatus & { keyId: string };
  return result;
}

export const getAccessCreditStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }): Promise<CreditStatus> => {
    const row = await requireAccessKey(admin(), data.key);
    return statusFromRow(row);
  });

export const getAccessProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const row = await requireAccessKey(admin(), data.key);
    return {
      keyId: row.id,
      name: row.label?.trim() || "Usuário Zunexi.ai",
      credits: statusFromRow(row),
    };
  });

export const updateAccessProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      key: z.string().trim().min(4).max(64),
      name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres.").max(60, "O nome pode ter no máximo 60 caracteres."),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const current = await requireAccessKey(sb, data.key);
    const name = data.name.trim();

    const { data: row, error } = await sb
      .from("access_keys")
      .update({ label: name })
      .eq("id", current.id)
      .eq("active", true)
      .select("id, label, unlimited_credits, credits_per_day, credits_used_today, credits_reset_date")
      .single();

    if (error) {
      console.error("Erro ao atualizar nome do perfil", error);
      throw new Error(`Não foi possível salvar o nome do perfil. ${error.message}`);
    }

    return {
      ok: true as const,
      keyId: row.id,
      name: row.label?.trim() || "Usuário Zunexi.ai",
      credits: statusFromRow(row),
    };
  });

// Alias para telas/componentes que usam um nome mais explícito para a mesma ação.
export const updateAccessDisplayName = updateAccessProfile;

export const verifyAccessKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const sb = admin();
    const normalized = data.key.trim().toUpperCase();
    const { data: row } = await sb
      .from("access_keys")
      .select("id, active, uses, label, unlimited_credits, credits_per_day, credits_used_today, credits_reset_date")
      .eq("key", normalized)
      .maybeSingle();
    if (!row || !row.active) return { ok: false as const };

    await sb.from("access_keys").update({ uses: (row.uses ?? 0) + 1, last_used_at: new Date().toISOString() }).eq("id", row.id);

    return {
      ok: true as const,
      keyId: row.id,
      name: row.label?.trim() || "Usuário Zunexi.ai",
      credits: statusFromRow(row),
    };
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
    const { data: rows, error } = await admin()
      .from("access_keys")
      .select("id, key, label, active, uses, last_used_at, created_at, credits_per_day, unlimited_credits, credits_used_today, credits_reset_date")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
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
    creditsPerDay: z.number().int().min(0).max(1_000_000),
    unlimited: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const key = randomKey();
    const { data: row, error } = await admin()
      .from("access_keys")
      .insert({
        key,
        label: data.label,
        credits_per_day: data.creditsPerDay,
        unlimited_credits: data.unlimited,
        credits_used_today: 0,
        credits_reset_date: brazilDate(),
      })
      .select("id, key, label, active, uses, last_used_at, created_at, credits_per_day, unlimited_credits, credits_used_today, credits_reset_date")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const adminUpdateCredits = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(20),
    id: z.string().uuid(),
    creditsPerDay: z.number().int().min(0).max(1_000_000),
    unlimited: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const { data: row, error } = await admin()
      .from("access_keys")
      .update({ credits_per_day: data.creditsPerDay, unlimited_credits: data.unlimited })
      .eq("id", data.id)
      .select("id, key, label, active, uses, last_used_at, created_at, credits_per_day, unlimited_credits, credits_used_today, credits_reset_date")
      .single();
    if (error) throw new Error(error.message);
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
    const { error } = await admin().from("access_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
