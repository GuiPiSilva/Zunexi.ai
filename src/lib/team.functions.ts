import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requirePlanFeature, type TenantContext } from "@/lib/access.functions";
import { getPlanDefinition } from "@/lib/plans";

const AccessInput = z.object({ accessKey: z.string().trim().min(4).max(64) });
const TeamRole = z.enum(["admin", "social", "designer", "approver", "analyst", "viewer", "support", "member"]);

function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let index = 0; index < 12; index += 1) out += chars[bytes[index] % chars.length];
  return `ZNX-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

function brazilDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function currentMonthStart() {
  return `${brazilDate().slice(0, 7)}-01`;
}

function requireTeamAdmin(context: TenantContext) {
  if (!["owner", "admin"].includes(String(context.member.role))) throw new Error("Somente proprietários e administradores podem gerenciar a equipe.");
}

export const listTeamMembers = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "equipe");
    const { data: rows, error } = await (sb as any)
      .from("tenant_members")
      .select("id,tenant_id,access_key_id,display_name,role,active,created_at,updated_at,access_keys(key,last_used_at,uses,active)")
      .eq("tenant_id", context.tenant.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { currentMemberId: context.member.id, members: rows ?? [] };
  });

export const createTeamMember = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ displayName: z.string().trim().min(2).max(120), role: TeamRole }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "equipe");
    requireTeamAdmin(context);
    const definition = getPlanDefinition(context.tenant.plan);
    const key = randomKey();
    const { data: access, error: accessError } = await (sb as any).from("access_keys").insert({
      key,
      label: data.displayName,
      tenant_id: context.tenant.id,
      plan: context.tenant.plan,
      credits_per_month: definition.creditsPerMonth,
      credits_used_month: context.tenant.credits_used_month,
      credits_reset_month: context.tenant.credits_reset_month,
      credits_per_day: definition.creditsPerMonth,
      unlimited_credits: context.tenant.unlimited_credits,
      credits_used_today: 0,
      credits_reset_date: brazilDate(),
      active: true,
    }).select("*").single();
    if (accessError) throw new Error(accessError.message);
    const { data: member, error: memberError } = await (sb as any).from("tenant_members").insert({
      tenant_id: context.tenant.id,
      access_key_id: access.id,
      display_name: data.displayName,
      role: data.role,
      active: true,
    }).select("*").single();
    if (memberError) {
      await (sb as any).from("access_keys").delete().eq("id", access.id);
      throw new Error(memberError.message);
    }
    return { ...member, access_key: key };
  });

export const updateTeamMember = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ memberId: z.string().uuid(), displayName: z.string().trim().min(2).max(120), role: TeamRole, active: z.boolean() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "equipe");
    requireTeamAdmin(context);
    const { data: existing, error: existingError } = await (sb as any).from("tenant_members").select("*").eq("tenant_id", context.tenant.id).eq("id", data.memberId).single();
    if (existingError) throw new Error(existingError.message);
    if (existing.role === "owner") throw new Error("O proprietário da empresa não pode ser alterado por esta tela.");
    const { data: member, error } = await (sb as any).from("tenant_members").update({ display_name: data.displayName, role: data.role, active: data.active, updated_at: new Date().toISOString() }).eq("tenant_id", context.tenant.id).eq("id", data.memberId).select("*").single();
    if (error) throw new Error(error.message);
    await (sb as any).from("access_keys").update({ label: data.displayName, active: data.active }).eq("id", existing.access_key_id).eq("tenant_id", context.tenant.id);
    return member;
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ memberId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requirePlanFeature(sb, data.accessKey, "equipe");
    requireTeamAdmin(context);
    if (data.memberId === context.member.id) throw new Error("Você não pode excluir o próprio acesso.");
    const { data: existing, error: existingError } = await (sb as any).from("tenant_members").select("*").eq("tenant_id", context.tenant.id).eq("id", data.memberId).single();
    if (existingError) throw new Error(existingError.message);
    if (existing.role === "owner") throw new Error("O proprietário da empresa não pode ser excluído.");
    const { error } = await (sb as any).from("access_keys").delete().eq("id", existing.access_key_id).eq("tenant_id", context.tenant.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
