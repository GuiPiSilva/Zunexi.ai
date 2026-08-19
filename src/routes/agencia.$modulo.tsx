import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileText,
  Gauge,
  Lightbulb,
  ListChecks,
  Loader2,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AgencySectionNav } from "@/components/agency/AgencySectionNav";
import { AGENCY_MODULES, getAgencyModuleBySlug, type AgencyModuleId } from "@/lib/agency-catalog";
import { deleteAgencyWorkflow, listAgencyProjects, listAgencyTasks, listAgencyWorkflows, runAgencyWorkflow, updateAgencyTask } from "@/lib/agency.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/agencia/$modulo")({
  head: ({ params }) => {
    const module = getAgencyModuleBySlug(params.modulo);
    return { meta: [{ title: `${module?.name || "Serviço"} — Agência 360 — Zunexi.ai` }] };
  },
  component: AgencyModulePage,
});

type TaskStatus = "backlog" | "in_progress" | "review" | "done";
type AgencyProject = { id: string; name: string; objective: string; audience: string; channels: string; budget: string; website: string; brand_profile_id?: string | null };
type AgencyTask = { id: string; project_id?: string | null; title: string; description: string; priority: string; status: TaskStatus; due_date?: string | null };
type AgencyResult = { summary?: string; diagnosis?: string[]; strategy?: string[]; deliverables?: string[]; kpis?: string[]; risks?: string[]; recommendations?: string[] };
type AgencyWorkflow = { id: string; project_id?: string | null; module: AgencyModuleId; title: string; summary: string; result: AgencyResult; created_at: string };

function AgencyModulePage() {
  const { modulo } = Route.useParams();
  const module = getAgencyModuleBySlug(modulo);
  const listProjectsFn = useServerFn(listAgencyProjects);
  const listWorkflowsFn = useServerFn(listAgencyWorkflows);
  const listTasksFn = useServerFn(listAgencyTasks);
  const runFn = useServerFn(runAgencyWorkflow);
  const updateTaskFn = useServerFn(updateAgencyTask);
  const deleteWorkflowFn = useServerFn(deleteAgencyWorkflow);

  const [projects, setProjects] = useState<AgencyProject[]>([]);
  const [workflows, setWorkflows] = useState<AgencyWorkflow[]>([]);
  const [tasks, setTasks] = useState<AgencyTask[]>([]);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    const accessKey = getAccessKey();
    if (!accessKey || !module) return;
    const [projectRows, workflowRows, taskRows] = await Promise.all([
      listProjectsFn({ data: { accessKey } }),
      listWorkflowsFn({ data: { accessKey, module: module.id } }),
      listTasksFn({ data: { accessKey, module: module.id } }),
    ]);
    setProjects(projectRows as AgencyProject[]);
    setWorkflows(workflowRows as AgencyWorkflow[]);
    setTasks(taskRows as AgencyTask[]);
    if (!projectId && projectRows.length) setProjectId(String(projectRows[0].id));
    if (!selectedResultId && workflowRows.length) setSelectedResultId(String(workflowRows[0].id));
  }

  useEffect(() => {
    if (!module) { setLoading(false); return; }
    setTitle(module.name);
    refresh().catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar este serviço.")).finally(() => setLoading(false));
  }, [modulo]);

  const selectedProject = projects.find((item) => item.id === projectId) || null;
  const filteredWorkflows = useMemo(() => projectId ? workflows.filter((item) => item.project_id === projectId) : workflows, [workflows, projectId]);
  const filteredTasks = useMemo(() => projectId ? tasks.filter((item) => item.project_id === projectId) : tasks, [tasks, projectId]);
  const selectedResult = filteredWorkflows.find((item) => item.id === selectedResultId) || filteredWorkflows[0] || null;
  const related = module ? AGENCY_MODULES.filter((item) => item.category === module.category && item.id !== module.id).slice(0, 3) : [];
  const done = filteredTasks.filter((item) => item.status === "done").length;
  const progress = filteredTasks.length ? Math.round((done / filteredTasks.length) * 100) : 0;

  if (!module) {
    return <AppShell><div className="page-wrap"><div className="panel flex min-h-[60vh] flex-col items-center justify-center p-8 text-center"><BriefcaseBusiness className="h-10 w-10 text-primary" /><h1 className="section-title mt-5 text-2xl">Serviço não encontrado</h1><p className="mt-2 text-sm text-muted-foreground">Esta página não corresponde a uma função da Agência 360.</p><Link to="/agencia" className="primary-button mt-5">Voltar para Agência 360</Link></div></div></AppShell>;
  }

  async function generate() {
    const accessKey = getAccessKey();
    if (!accessKey) return;
    if (brief.trim().length < 8) { toast.error("Descreva o que a empresa precisa neste serviço."); return; }
    setGenerating(true);
    try {
      const response = await runFn({ data: { accessKey, jobId: crypto.randomUUID(), module: module.id, projectId: projectId || null, brandId: selectedProject?.brand_profile_id || null, title: title.trim() || module.name, brief: brief.trim(), objective: selectedProject?.objective || "", audience: selectedProject?.audience || "", channels: selectedProject?.channels || "", budget: selectedProject?.budget || "", website: selectedProject?.website || "" } });
      setBrief("");
      setSelectedResultId(String(response.workflow.id));
      await refresh();
      toast.success(`${module.shortName}: plano criado e tarefas adicionadas.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível gerar o plano."); }
    finally { setGenerating(false); }
  }

  async function changeTaskStatus(task: AgencyTask, status: TaskStatus) {
    const accessKey = getAccessKey(); if (!accessKey || task.status === status) return;
    try { await updateTaskFn({ data: { accessKey, id: task.id, status } }); setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item)); toast.success("Tarefa atualizada."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa."); }
  }

  async function removeWorkflow(workflow: AgencyWorkflow) {
    const accessKey = getAccessKey(); if (!accessKey || !confirm(`Excluir o plano “${workflow.title}” e suas tarefas?`)) return;
    try { await deleteWorkflowFn({ data: { accessKey, id: workflow.id } }); setWorkflows((current) => current.filter((item) => item.id !== workflow.id)); setTasks((current) => current.filter((item) => item.id !== workflow.id)); setSelectedResultId(""); await refresh(); toast.success("Plano removido."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o plano."); }
  }

  return (
    <AppShell><div className="page-wrap space-y-6 pb-16">
      <AgencySectionNav />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Link to="/agencia" className="flex items-center gap-1 hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Agência 360</Link><span>/</span><span>{module.category}</span><span>/</span><strong className="text-foreground">{module.shortName}</strong></div>

      <section className="panel relative overflow-hidden p-6 sm:p-8 xl:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_380px] xl:items-end"><div><span className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-primary">{module.category}</span><h1 className="section-title mt-5 text-4xl tracking-[-.05em] sm:text-5xl">{module.name}</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">{module.description}</p><div className="mt-5 flex flex-wrap gap-2">{module.outputs.map((output) => <span key={output} className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs">{output}</span>)}</div></div><div className="grid grid-cols-2 gap-3"><MiniMetric icon={FileText} value={filteredWorkflows.length} label="Planos" /><MiniMetric icon={ListChecks} value={filteredTasks.length} label="Tarefas" /><MiniMetric icon={CheckCircle2} value={done} label="Concluídas" /><MiniMetric icon={Gauge} value={`${progress}%`} label="Execução" /></div></div>
      </section>

      <section className="panel p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end"><label className="block text-xs font-semibold text-muted-foreground">Cliente/projeto<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setSelectedResultId(""); }} className="app-input mt-2"><option value="">Operação geral da empresa</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><Link to="/agencia/clientes" className="secondary-button"><Building2 className="h-4 w-4" /> Gerenciar clientes</Link></div>
        {selectedProject && <div className="mt-4 grid gap-3 border-t border-border/70 pt-4 md:grid-cols-2 xl:grid-cols-4"><Context label="Objetivo" value={selectedProject.objective || "Não informado"} /><Context label="Público" value={selectedProject.audience || "Não informado"} /><Context label="Canais" value={selectedProject.channels || "Não informados"} /><Context label="Orçamento" value={selectedProject.budget || "Não informado"} /></div>}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_420px]">
        <div className="panel p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary"><WandSparkles className="h-5 w-5" /></div><div><h2 className="section-title text-xl">Novo planejamento</h2><p className="mt-1 text-xs text-muted-foreground">A IA usará o cliente e o Brand Kit vinculado como contexto.</p></div></div><div className="mt-5 space-y-4"><label className="block text-xs font-semibold text-muted-foreground">Título do trabalho<input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input mt-2" placeholder={module.name} /></label><label className="block text-xs font-semibold text-muted-foreground">Briefing<textarea value={brief} onChange={(event) => setBrief(event.target.value)} className="app-input mt-2 min-h-44 resize-y" placeholder={`Ex.: Preciso de um plano de ${module.shortName.toLowerCase()} para aumentar as vendas nos próximos 90 dias. Inclua prioridades, entregáveis e KPIs.`} /></label><button onClick={generate} disabled={generating} className="primary-button w-full sm:w-auto">{generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando plano...</> : <><Sparkles className="h-4 w-4" /> Gerar plano com IA</>}</button></div></div>
        <aside className="panel p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="section-title text-lg">Ferramentas relacionadas</h2><p className="mt-1 text-xs text-muted-foreground">Atalhos úteis para executar o plano.</p></div><Target className="h-5 w-5 text-primary" /></div>{module.route ? <Link to={module.route as any} className="mt-5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/8 p-4 hover:border-primary/40"><div><div className="text-sm font-semibold">Abrir ferramenta Zunexi</div><div className="mt-1 text-xs text-muted-foreground">Continuar a execução no módulo conectado.</div></div><ExternalLink className="h-4 w-4 text-primary" /></Link> : <div className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Este serviço é executado diretamente nesta página por meio dos planos, tarefas e histórico da Agência 360.</div>}<div className="mt-5 space-y-2"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Serviços relacionados</div>{related.map((item) => <Link key={item.id} to="/agencia/$modulo" params={{ modulo: item.slug }} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm hover:border-primary/30 hover:bg-primary/[.03]"><span>{item.shortName}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div></aside>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_390px]">
        <div className="panel p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title text-xl">Resultado estratégico</h2><p className="mt-1 text-xs text-muted-foreground">Selecione um plano do histórico deste serviço.</p></div>{filteredWorkflows.length > 0 && <select value={selectedResult?.id || ""} onChange={(event) => setSelectedResultId(event.target.value)} className="app-input w-full sm:w-72">{filteredWorkflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.title}</option>)}</select>}</div>{loading ? <div className="grid min-h-56 place-items-center text-sm text-muted-foreground">Carregando...</div> : !selectedResult ? <div className="flex min-h-56 flex-col items-center justify-center text-center"><ClipboardCheck className="h-8 w-8 text-primary" /><h3 className="section-title mt-4 text-lg">Nenhum plano criado ainda</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">Preencha o briefing acima para gerar o primeiro plano de {module.shortName}.</p></div> : <div className="mt-5 space-y-5"><div className="rounded-xl border border-primary/20 bg-primary/[.04] p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">Resumo</div><p className="mt-2 text-sm leading-6">{selectedResult.result?.summary || selectedResult.summary}</p></div><button onClick={() => removeWorkflow(selectedResult)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400" title="Excluir plano"><Trash2 className="h-4 w-4" /></button></div></div><ResultGrid result={selectedResult.result} /></div>}</div>

        <aside className="panel p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="section-title text-lg">Tarefas deste serviço</h2><p className="mt-1 text-xs text-muted-foreground">{filteredTasks.length} tarefas no projeto selecionado.</p></div><ListChecks className="h-5 w-5 text-primary" /></div>{filteredTasks.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-xs leading-5 text-muted-foreground">As tarefas serão criadas automaticamente quando um plano for gerado.</div> : <div className="mt-5 space-y-3">{filteredTasks.slice(0, 8).map((task) => <div key={task.id} className="rounded-xl border border-border p-3"><div className="text-xs font-semibold leading-5">{task.title}</div><div className="mt-2 flex items-center gap-2"><select value={task.status} onChange={(event) => changeTaskStatus(task, event.target.value as TaskStatus)} className="app-input py-2 text-xs"><option value="backlog">Backlog</option><option value="in_progress">Em andamento</option><option value="review">Revisão</option><option value="done">Concluído</option></select></div>{task.due_date && <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3" /> Prazo {new Date(`${task.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</div>}</div>)}{filteredTasks.length > 8 && <Link to="/agencia/tarefas" className="secondary-button w-full">Ver todas as tarefas</Link>}</div>}</aside>
      </section>
    </div></AppShell>
  );
}

function MiniMetric({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: string | number; label: string }) { return <div className="rounded-xl border border-border bg-black/10 p-3 dark:bg-black/20"><Icon className="h-4 w-4 text-primary" /><div className="mt-3 text-xl font-bold">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{label}</div></div>; }
function Context({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-secondary/45 p-3"><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-1 line-clamp-2 text-xs leading-5">{value}</div></div>; }
function ResultGrid({ result }: { result: AgencyResult }) { const groups = [{ title: "Diagnóstico", icon: FileText, items: result?.diagnosis }, { title: "Estratégia", icon: Target, items: result?.strategy }, { title: "Entregáveis", icon: ClipboardCheck, items: result?.deliverables }, { title: "KPIs", icon: Gauge, items: result?.kpis }, { title: "Riscos", icon: ShieldAlert, items: result?.risks }, { title: "Recomendações", icon: Lightbulb, items: result?.recommendations }]; return <div className="grid gap-4 md:grid-cols-2">{groups.map(({ title, icon: Icon, items }) => <div key={title} className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{title}</h3></div>{items?.length ? <ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${title}-${index}`} className="flex gap-2 text-xs leading-5 text-muted-foreground"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">Sem itens neste bloco.</p>}</div>)}</div>; }
