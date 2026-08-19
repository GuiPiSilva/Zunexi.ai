import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, CircleDashed, Filter, ListChecks, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AgencySectionNav } from "@/components/agency/AgencySectionNav";
import { AGENCY_MODULES, getAgencyModule, type AgencyModuleId } from "@/lib/agency-catalog";
import { listAgencyProjects, listAgencyTasks, updateAgencyTask } from "@/lib/agency.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/agencia/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Agência 360 — Zunexi.ai" }] }),
  component: AgencyTasks,
});

type TaskStatus = "backlog" | "in_progress" | "review" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type AgencyTask = { id: string; project_id?: string | null; module: AgencyModuleId; title: string; description: string; priority: TaskPriority; status: TaskStatus; due_date?: string | null; agency_projects?: { name?: string } | null };
type AgencyProject = { id: string; name: string };

const COLUMNS: Array<{ id: TaskStatus; label: string; note: string }> = [
  { id: "backlog", label: "Backlog", note: "A fazer" },
  { id: "in_progress", label: "Em andamento", note: "Em execução" },
  { id: "review", label: "Revisão", note: "Validar entrega" },
  { id: "done", label: "Concluído", note: "Finalizado" },
];
const PRIORITY: Record<TaskPriority, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

function AgencyTasks() {
  const listTasksFn = useServerFn(listAgencyTasks);
  const listProjectsFn = useServerFn(listAgencyProjects);
  const updateFn = useServerFn(updateAgencyTask);
  const [tasks, setTasks] = useState<AgencyTask[]>([]);
  const [projects, setProjects] = useState<AgencyProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const accessKey = getAccessKey(); if (!accessKey) return;
    const [taskRows, projectRows] = await Promise.all([listTasksFn({ data: { accessKey } }), listProjectsFn({ data: { accessKey } })]);
    setTasks(taskRows as AgencyTask[]); setProjects(projectRows as AgencyProject[]);
  }

  useEffect(() => { refresh().catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar as tarefas.")).finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => tasks.filter((task) => (!projectId || task.project_id === projectId) && (!moduleId || task.module === moduleId)), [tasks, projectId, moduleId]);

  async function updateStatus(task: AgencyTask, status: TaskStatus) {
    const accessKey = getAccessKey(); if (!accessKey || task.status === status) return;
    try { await updateFn({ data: { accessKey, id: task.id, status } }); setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item)); toast.success("Status atualizado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa."); }
  }

  async function updatePriority(task: AgencyTask, priority: TaskPriority) {
    const accessKey = getAccessKey(); if (!accessKey || task.priority === priority) return;
    try { await updateFn({ data: { accessKey, id: task.id, priority } }); setTasks((current) => current.map((item) => item.id === task.id ? { ...item, priority } : item)); toast.success("Prioridade atualizada."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a prioridade."); }
  }

  return (
    <AppShell><div className="page-wrap space-y-6 pb-16">
      <AgencySectionNav />
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="eyebrow mb-2 flex items-center gap-2"><ListChecks className="h-3.5 w-3.5 text-primary" /> Operação</div><h1 className="section-title text-3xl sm:text-4xl">Tarefas da agência</h1><p className="mt-2 text-sm text-muted-foreground">Todas as tarefas geradas pelos serviços, organizadas por etapa.</p></div><button onClick={() => refresh().catch(() => undefined)} className="secondary-button"><RefreshCcw className="h-4 w-4" /> Atualizar</button></section>

      <section className="panel p-4"><div className="grid gap-3 md:grid-cols-[auto_1fr_1fr]"><div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground"><Filter className="h-4 w-4" /> Filtros</div><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="app-input"><option value="">Todos os clientes</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><select value={moduleId} onChange={(event) => setModuleId(event.target.value)} className="app-input"><option value="">Todos os serviços</option>{AGENCY_MODULES.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}</select></div></section>

      {loading ? <div className="panel grid min-h-64 place-items-center text-sm text-muted-foreground">Carregando tarefas...</div> : filtered.length === 0 ? <div className="panel flex min-h-64 flex-col items-center justify-center p-8 text-center"><CheckCircle2 className="h-8 w-8 text-primary" /><h2 className="section-title mt-4 text-xl">Nenhuma tarefa neste filtro</h2><p className="mt-2 text-sm text-muted-foreground">Gere um plano em uma das páginas de serviço para criar tarefas automaticamente.</p><Link to="/agencia" className="primary-button mt-5">Escolher serviço</Link></div> : (
        <section className="grid gap-4 xl:grid-cols-4">{COLUMNS.map((column) => { const columnTasks = filtered.filter((task) => task.status === column.id); return <div key={column.id} className="panel min-h-[360px] p-3"><div className="flex items-center justify-between border-b border-border/70 px-1 pb-3"><div><h2 className="text-sm font-semibold">{column.label}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{column.note}</p></div><span className="grid h-7 min-w-7 place-items-center rounded-full bg-secondary px-2 text-xs font-bold">{columnTasks.length}</span></div><div className="mt-3 space-y-3">{columnTasks.map((task) => <article key={task.id} className="rounded-xl border border-border bg-card/60 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-primary">{getAgencyModule(task.module).shortName}</span><h3 className="mt-1 text-sm font-semibold leading-5">{task.title}</h3></div><CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /></div>{task.description && <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{task.description}</p>}<div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">{task.agency_projects?.name && <span className="rounded-full bg-secondary px-2 py-1">{task.agency_projects.name}</span>}{task.due_date && <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1"><CalendarDays className="h-3 w-3" /> {new Date(`${task.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</span>}</div><div className="mt-3 grid gap-2"><select value={task.status} onChange={(event) => updateStatus(task, event.target.value as TaskStatus)} className="app-input py-2 text-xs"><option value="backlog">Backlog</option><option value="in_progress">Em andamento</option><option value="review">Revisão</option><option value="done">Concluído</option></select><select value={task.priority} onChange={(event) => updatePriority(task, event.target.value as TaskPriority)} className="app-input py-2 text-xs">{Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>Prioridade: {label}</option>)}</select></div><Link to="/agencia/$modulo" params={{ modulo: getAgencyModule(task.module).slug }} className="mt-3 flex items-center justify-end gap-1 text-[11px] font-semibold text-primary">Abrir serviço <ArrowRight className="h-3.5 w-3.5" /></Link></article>)}</div></div>; })}</section>
      )}
    </div></AppShell>
  );
}
