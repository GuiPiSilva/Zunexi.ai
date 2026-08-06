import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireTenantContext } from "@/lib/access.functions";

const AccessInput = z.object({ accessKey: z.string().trim().min(4).max(64) });
const ProjectInput = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(240),
  type: z.enum(["carrossel", "cartaz"]),
  payload: z.unknown(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
const LibraryInput = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(240),
  url: z.string().min(1),
  addedAt: z.number(),
});

export const listCloudWorkspace = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const [{ data: projects, error: projectError }, { data: library, error: libraryError }] = await Promise.all([
      (sb as any).from("cloud_projects").select("*").eq("tenant_id", context.tenant.id).eq("owner_member_id", context.member.id).order("updated_at", { ascending: false }),
      (sb as any).from("cloud_library_items").select("*").eq("tenant_id", context.tenant.id).eq("owner_member_id", context.member.id).order("created_at", { ascending: false }),
    ]);
    if (projectError) throw new Error(projectError.message);
    if (libraryError) throw new Error(libraryError.message);
    return {
      tenantId: context.tenant.id,
      memberId: context.member.id,
      projects: (projects ?? []).map((row: any) => row.payload),
      library: (library ?? []).map((row: any) => ({ id: row.id, name: row.name, url: row.url, addedAt: new Date(row.created_at).getTime() })),
    };
  });

export const upsertCloudProject = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ project: ProjectInput }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { error } = await (sb as any).from("cloud_projects").upsert({
      id: data.project.id,
      tenant_id: context.tenant.id,
      owner_member_id: context.member.id,
      name: data.project.name,
      project_type: data.project.type,
      payload: data.project.payload,
      created_at: new Date(data.project.createdAt).toISOString(),
      updated_at: new Date(data.project.updatedAt).toISOString(),
    }, { onConflict: "tenant_id,owner_member_id,id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCloudProject = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().min(1).max(160) }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { error } = await (sb as any).from("cloud_projects").delete().eq("id", data.id).eq("tenant_id", context.tenant.id).eq("owner_member_id", context.member.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const upsertCloudLibraryItem = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ item: LibraryInput }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { error } = await (sb as any).from("cloud_library_items").upsert({
      id: data.item.id,
      tenant_id: context.tenant.id,
      owner_member_id: context.member.id,
      name: data.item.name,
      url: data.item.url,
      created_at: new Date(data.item.addedAt).toISOString(),
      metadata: {},
    }, { onConflict: "tenant_id,owner_member_id,id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCloudLibraryItem = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => AccessInput.extend({ id: z.string().min(1).max(160) }).parse(value))
  .handler(async ({ data }) => {
    const sb = admin();
    const context = await requireTenantContext(sb, data.accessKey);
    const { error } = await (sb as any).from("cloud_library_items").delete().eq("id", data.id).eq("tenant_id", context.tenant.id).eq("owner_member_id", context.member.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
