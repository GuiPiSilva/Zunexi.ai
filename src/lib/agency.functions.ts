import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, consumeAccessCredit, requireTenantContext } from "@/lib/access.functions";
import { brandContextAsPrompt, resolveBrandContext } from "@/lib/brand.functions";
import { AGENCY_MODULES, getAgencyModule, type AgencyModuleId } from "@/lib/agency-catalog";

const MODULE_IDS = AGENCY_MODULES.map((item) => item.id) as [AgencyModuleId, ...AgencyModuleId[]];
const AgencyModule = z.enum(MODULE_IDS);
const AccessInput = z.object({ accessKey: z.string().trim().min(4).max(64) });
const TaskStatus = z.enum(["backlog", "in_progress", "review", "done"]);
const TaskPriority = z.enum(["low", "medium", "high", "urgent"]);

const ProjectPayload = z.object({
  id: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(180),
  objective: z.string().trim().max(2000).default(""),
  audience: z.string().trim().max(2000).default(""),
  channels: z.string().trim().max(1200).default(""),
  budget: z.string().trim().max(500).default(""),
  website: z.string().trim().max(500).default(""),
  status: z.enum(["active", "paused", "completed", "archived"]).default("active"),
});

const RunAgencyInput = AccessInput.extend({
  jobId: z.string().uuid(),
  module: AgencyModule,
  projectId: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  brief: z.string().trim().min(8).max(6000),
  objective: z.string().trim().max(1200).default(""),
  audience: z.string().trim().max(1200).default(""),
  channels: z.string().trim().max(1200).default(""),
  budget: z.string().trim().max(500).default(""),
  website: z.string().trim().max(500).default(""),
});

function cleanJson(raw: string) {
  const text = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    throw new Error("A IA retornou um plano em formato inválido. Tente novamente.");
  }
}

function stringList(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

function normalizedResult(value: Record<string, unknown>) {
  const tasksRaw = Array.isArray(value.tasks) ? value.tasks : [];
  return {
    summary: String(value.summary || "Plano gerado pela Zunexi.ai.").trim().slice(0, 5000),
    diagnosis: stringList(value.diagnosis, 10),
    strategy: stringList(value.strategy, 14),
    deliverables: stringList(value.deliverables, 16),
    kpis: stringList(value.kpis, 12),
    risks: stringList(value.risks, 10),
    recommendations: stringList(value.recommendations, 12),
    tasks: tasksRaw.slice(0, 20).map((task: any, index) => ({
      title: String(task?.title || `Tarefa ${index + 1}`).trim().slice(0, 220),
      description: String(task?.description || "").trim().slice(0, 3000),
      priority: ["low", "medium", "high", "urgent"].includes(String(task?.priority)) ? String(task.priority) : "medium",
      dueInDays: Math.max(0, Math.min(365, Number(task?.dueInDays || 0))),
    })),
  };
}

async function validateProject(sb: ReturnType<typeof admin>, tenantId: string, projectId?: string | null) {
  if (!projectId) return null;
  const { data, error } = await (sb as any).from("agency_projects").select("*").eq("tenant_id", tenantId).eq("id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Projeto de agência não encontrado nesta empresa.");
  return data;
}

async function validateBrand(sb: ReturnType<typeof admin>, context: Awaited<ReturnType<typeof requireTenantContext>>, brandId?: string | null) {
  if (!brandId) return null;
  const brand = await resolveBrandContext(sb, context, brandId);
  if (!brand) throw new Error("Brand Kit não encontrado nesta empresa.");
  return brand;
}

async function requestAgencyPlan(args: {
  moduleId: AgencyModuleId;
  title: string;
  brief: string;
  objective: string;
  audience: string;
  channels: string;
  budget: string;
  website: string;
  project: any;
  brandPrompt: string;
}) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada na Vercel.");
  const module = getAgencyModule(args.moduleId);
  const model = String(process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  const context = [
    `Serviço: ${module.name}`,
    `Objetivo do serviço: ${module.description}`,
    `Entregáveis esperados: ${module.outputs.join(", ")}`,
    `Título: ${args.title}`,
    `Briefing: ${args.brief}`,
    `Objetivo de negócio: ${args.objective || args.project?.objective || "não informado"}`,
    `Público: ${args.audience || args.project?.audience || "não informado"}`,
    `Canais: ${args.channels || args.project?.channels || "não informado"}`,
    `Orçamento: ${args.budget || args.project?.budget || "não informado"}`,
    `Site: ${args.website || args.project?.website || "não informado"}`,
    args.brandPrompt,
  ].join("\n\n");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: "json_object" },
        max_completion_tokens: 3000,
        messages: [
          {
            role: "system",
            content: "Você é a diretora de estratégia e operações de uma agência de marketing brasileira. Gere planos práticos, específicos e executáveis, sem frases genéricas e sem inventar dados que o cliente não forneceu. Responda SOMENTE JSON com: summary (string), diagnosis (array de strings), strategy (array), deliverables (array), kpis (array), risks (array), recommendations (array), tasks (array de objetos com title, description, priority low|medium|high|urgent, dueInDays número). Cada tarefa deve ser concreta e começar com verbo. Use pt-BR.",
          },
          { role: "user", content: context.slice(0, 22000) },
        ],
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      let detail = body;
      try { detail = String(JSON.parse(body)?.error?.message || body); } catch { /* plain text */ }
      if (response.status === 401 || response.status === 403) throw new Error("Chave da Groq inválida ou sem permissão.");
      if (response.status === 429) throw new Error("Limite da Groq atingido. Tente novamente em instantes.");
      throw new Error(`A Groq recusou a geração (${response.status}): ${detail.slice(0, 280)}`);
    }
    const json = JSON.parse(body) as any;
    return normalizedResult(cleanJson(String(json?.choices?.[0]?.message?.content || "{}")));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("A geração demorou demais. Tente novamente com um briefing mais curto.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const listAgencyProjects = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { data: rows, error } = await (sb as any).from("agency_projects").select("*, brand_profiles(name)").eq("tenant_id", context.tenant.id).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveAgencyProject = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ project: ProjectPayload }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const brand = await validateBrand(sb, context, data.project.brandId);
    const payload = {
      tenant_id: context.tenant.id,
      brand_profile_id: brand?.id || null,
      owner_member_id: context.member.id,
      name: data.project.name,
      objective: data.project.objective,
      audience: data.project.audience,
      channels: data.project.channels,
      budget: data.project.budget,
      website: data.project.website,
      status: data.project.status,
      updated_at: new Date().toISOString(),
    };
    const query = data.project.id
      ? (sb as any).from("agency_projects").update(payload).eq("tenant_id", context.tenant.id).eq("id", data.project.id)
      : (sb as any).from("agency_projects").insert(payload);
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAgencyProject = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { error } = await (sb as any).from("agency_projects").delete().eq("tenant_id", context.tenant.id).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAgencyWorkflows = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ projectId: z.string().uuid().optional().nullable(), module: AgencyModule.optional() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    let query = (sb as any).from("agency_workflows").select("*").eq("tenant_id", context.tenant.id).order("updated_at", { ascending: false }).limit(200);
    if (data.projectId) query = query.eq("project_id", data.projectId);
    if (data.module) query = query.eq("module", data.module);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const runAgencyWorkflow = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => RunAgencyInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const project = await validateProject(sb, context.tenant.id, data.projectId);
    const brandId = data.brandId || project?.brand_profile_id || null;
    const brand = brandId ? await validateBrand(sb, context, brandId) : null;
    await consumeAccessCredit(sb, data.accessKey, data.jobId);

    const result = await requestAgencyPlan({
      moduleId: data.module,
      title: data.title,
      brief: data.brief,
      objective: data.objective,
      audience: data.audience,
      channels: data.channels,
      budget: data.budget,
      website: data.website,
      project,
      brandPrompt: brandContextAsPrompt(brand, 5000),
    });

    const { data: workflow, error } = await (sb as any).from("agency_workflows").insert({
      tenant_id: context.tenant.id,
      project_id: project?.id || null,
      brand_profile_id: brand?.id || null,
      created_by_member_id: context.member.id,
      module: data.module,
      title: data.title,
      brief: data.brief,
      status: "ready",
      summary: result.summary,
      result,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw new Error(error.message);

    const taskRows = result.tasks.map((task) => ({
      tenant_id: context.tenant.id,
      project_id: project?.id || null,
      workflow_id: workflow.id,
      assigned_member_id: context.member.id,
      module: data.module,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: "backlog",
      due_date: task.dueInDays > 0 ? new Date(Date.now() + task.dueInDays * 86400000).toISOString().slice(0, 10) : null,
    }));
    let tasks: any[] = [];
    if (taskRows.length) {
      const inserted = await (sb as any).from("agency_tasks").insert(taskRows).select("*");
      if (inserted.error) throw new Error(inserted.error.message);
      tasks = inserted.data ?? [];
    }
    if (project?.id) await (sb as any).from("agency_projects").update({ updated_at: new Date().toISOString() }).eq("tenant_id", context.tenant.id).eq("id", project.id);
    return { workflow, result, tasks };
  });

export const listAgencyTasks = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ projectId: z.string().uuid().optional().nullable(), status: TaskStatus.optional() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    let query = (sb as any).from("agency_tasks").select("*, agency_projects(name)").eq("tenant_id", context.tenant.id).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(400);
    if (data.projectId) query = query.eq("project_id", data.projectId);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateAgencyTask = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({
    id: z.string().uuid(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
    assignedMemberId: z.string().uuid().nullable().optional(),
    dueDate: z.string().date().nullable().optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const updates: any = { updated_at: new Date().toISOString() };
    if (data.status) updates.status = data.status;
    if (data.priority) updates.priority = data.priority;
    if (data.assignedMemberId !== undefined) updates.assigned_member_id = data.assignedMemberId;
    if (data.dueDate !== undefined) updates.due_date = data.dueDate;
    const { data: row, error } = await (sb as any).from("agency_tasks").update(updates).eq("tenant_id", context.tenant.id).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAgencyWorkflow = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { error } = await (sb as any).from("agency_workflows").delete().eq("tenant_id", context.tenant.id).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
