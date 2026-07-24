import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function admin() {
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

/** Public: validates a key created by the administrator. */
export const verifyAccessKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; keyId: string; name: string } | { ok: false }> => {
    const sb = admin();
    const normalized = data.key.trim().toUpperCase();
    const { data: row } = await sb.from("access_keys").select("id, active, uses, label").eq("key", normalized).maybeSingle();
    if (!row || !row.active) return { ok: false };

    await sb
      .from("access_keys")
      .update({ uses: (row.uses ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", row.id);

    return {
      ok: true,
      keyId: row.id,
      name: row.label?.trim() || "Usuário InLabs",
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
      .select("id, key, label, active, uses, last_used_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminCreateKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(20),
    label: z.string().trim().min(2, "Informe para quem a chave será criada.").max(120),
  }).parse(d))
  .handler(async ({ data }) => {
    checkAdmin(data.token);
    const key = randomKey();
    const { data: row, error } = await admin()
      .from("access_keys")
      .insert({ key, label: data.label })
      .select("id, key, label, active, uses, last_used_at, created_at")
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
