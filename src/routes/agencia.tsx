import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  Clock3,
  FileText,
  Filter,
  Globe2,
  LayoutGrid,
  ListChecks,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AGENCY_CATEGORIES, AGENCY_MODULES, getAgencyModule, type AgencyModuleId } from "@/lib/agency-catalog";
import {
  deleteAgencyProject,
  deleteAgencyWorkflow,
  listAgencyProjects,
  listAgencyTasks,
  listAgencyWorkflows,
  runAgencyWorkflow,
  saveAgencyProject,
  updateAgencyTask,
} from "@/lib/agency.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/agencia")({
  head: () => ({
    meta: [
      { title: "Agência 360 — Zunexi.ai" },
      { name: "description", content: "Central operacional completa de marketing da Zunexi.ai." },
    ],
  }),
  component: Agency360,
});

type AgencyProject = {
  id: string;
  name: string;
  objective: string;
  audience: string;
  channels: string;
  budget: string;
  website: string;
  status: "active" | "paused" | "completed" | "archived";
  brand_profile_id?: string | null;
};

type AgencyTask = {
  id: string;
  project_id?: string | null;
  workflow_id?: string | null;
  module: AgencyModuleId;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "backlog" | "in_progress" | "review" | "done";
  due_date?: string | null;
  agency_projects?: { name?: string } | null;
};

type AgencyWorkflow = {
  id: string;
  project_id?: string | null;
  module: AgencyModuleId;
  title: string;
  summary: string;
  result: AgencyResult;
  created_at: string;
};

type AgencyResult = {
  summary?: string;
  diagnosis?: string[];
  strategy?: string[];
  deliverables?: string[];
  kpis?: string[];
  risks?: string[];
  recommendations?: string[];
  tasks?: Array<{ title: string; description?: string; priority?: string; dueInDays?: number }>;
};

type View = "services" | "tasks" | "history";

const STATUS_ORDER: AgencyTask["status"][] = ["backlog", "in_progress", "review", "done"];
const STATUS_LABEL: Record<AgencyTask["status"], string> = {
  backlog: "Backlog",
  in_progress: "Em andamento",
  review: "Revisão",
  done: "Concluído",
};
const PRIORITY_LABEL: Record<AgencyTask["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

function Agency360() {
  const listProjectsFn = useServerFn(listAgencyProjects);
  const saveProjectFn = useServerFn(saveAgencyProject);
  const deleteProjectFn = useServerFn(deleteAgencyProject);
  const listWorkflowsFn = useServerFn(listAgencyWorkflows);
  const runWorkflowFn = useServerFn(runAgencyWorkflow);
  const deleteWorkflowFn = useServerFn(deleteAgencyWorkflow);
  const listTasksFn = useServerFn(listAgencyTasks);
  const updateTaskFn = useServerFn(updateAgencyTask);

  const [projects, setProjects] = useState<AgencyProject[]>([]);
  const [tasks, setTasks] = useState<AgencyTask[]>([]);
  const [workflows, setWorkflows] = useState<AgencyWorkflow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<AgencyModuleId>("strategy");
  const [selectedResult, setSelectedResult] = useState<AgencyWorkflow | null>(null);
  const [view, setView] = useState<View>("services");
  const [category, setCategory] = useState("Todos");
  const [query, setQuery] = useState("");
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", objective: "", audience: "", channels: "", budget: "", website: "" });

  const selectedProject = projects.find((item) => item.id === selectedProjectId) || null;
  const module = getAgencyModule(selectedModule);

  async function refresh() {
    const accessKey = getAccessKey();
    if (!accessKey) return;
    const [projectRows, workflowRows, taskRows] = await Promise.all([
      listProjectsFn({ data: { accessKey } }),
      listWorkflowsFn({ data: { accessKey } }),
      listTasksFn({ data: { accessKey } }),
    ]);
    setProjects(projectRows as AgencyProject[]);
    setWorkflows(workflowRows as AgencyWorkflow[]);
    setTasks(taskRows as AgencyTask[]);
    if (!selectedProjectId && projectRows.length) setSelectedProjectId(String(projectRows[0].id));
  }

  useEffect(() => {
    refresh().catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar a Agência 360.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!title.trim()) setTitle(`${module.name}${selectedProject ? ` — ${selectedProject.name}` : ""}`);
  }, [selectedModule, selectedProjectId]);

  const visibleModules = useMemo(() => {
    const value = query.trim().toLowerCase();
    return AGENCY_MODULES.filter((item) => {
      const matchesCategory = category === "Todos" || item.category === category;
      const matchesSearch = !value || `${item.name} ${item.description} ${item.category} ${item.outputs.join(" ")}`.toLowerCase().includes(value);
      return matchesCategory && matchesSearch;
    });
  }, [category, query]);

  const projectTasks = useMemo(() => selectedProjectId ? tasks.filter((task) => task.project_id === selectedProjectId) : tasks, [selectedProjectId, tasks]);
  const projectWorkflows = useMemo(() => selectedProjectId ? workflows.filter((item) => item.project_id === selectedProjectId) : workflows, [selectedProjectId, workflows]);
  const completed = projectTasks.filter((task) => task.status === "done").length;
  const progress = projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0;

  function selectModule(id: AgencyModuleId) {
    setSelectedModule(id);
    setTitle(`${getAgencyModule(id).name}${selectedProject ? ` — ${selectedProject.name}` : ""}`);
    setBrief("");
    setView("services");
    document.getElementById("agency-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveProject() {
    const accessKey = getAccessKey();
    if (!accessKey || !projectForm.name.trim()) return;
    setProjectSaving(true);
    try {
      const row = await saveProjectFn({
        data: {
          accessKey,
          project: {
            name: projectForm.name,
            objective: projectForm.objective,
            audience: projectForm.audience,
            channels: projectForm.channels,
            budget: projectForm.budget,
            website: projectForm.website,
            status: "active",
          },
        },
      });
      await refresh();
      setSelectedProjectId(String(row.id));
      setProjectForm({ name: "", objective: "", audience: "", channels: "", budget: "", website: "" });
      setProjectFormOpen(false);
      toast.success("Cliente/projeto criado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o projeto.");
    } finally {
      setProjectSaving(false);
    }
  }

  async function removeProject(project: AgencyProject) {
    const accessKey = getAccessKey();
    if (!accessKey || !confirm(`Excluir o projeto “${project.name}” e seus workflows/tarefas?`)) return;
    try {
      await deleteProjectFn({ data: { accessKey, id: project.id } });
      if (selectedProjectId === project.id) setSelectedProjectId("");
      await refresh();
      toast.success("Projeto excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  async function generate() {
    const accessKey = getAccessKey();
    if (!accessKey) return;
    if (!brief.trim() || brief.trim().length < 8) {
      toast.error("Descreva o que a empresa precisa neste serviço.");
      return;
    }
    setGenerating(true);
    try {
      const response = await runWorkflowFn({
        data: {
          accessKey,
          jobId: crypto.randomUUID(),
          module: selectedModule,
          projectId: selectedProjectId || null,
          brandId: selectedProject?.brand_profile_id || null,
          title: title.trim() || module.name,
          brief: brief.trim(),
          objective: selectedProject?.objective || "",
          audience: selectedProject?.audience || "",
          channels: selectedProject?.channels || "",
          budget: selectedProject?.budget || "",
          website: selectedProject?.website || "",
        },
      });
      const workflow = response.workflow as AgencyWorkflow;
      workflow.result = response.result as AgencyResult;
      setSelectedResult(workflow);
      setBrief("");
      await refresh();
      toast.success(`${module.name}: plano criado e tarefas adicionadas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o plano.");
    } finally {
      setGenerating(false);
    }
  }

  async function moveTask(task: AgencyTask, direction: 1 | -1) {
    const accessKey = getAccessKey();
    if (!accessKey) return;
    const current = STATUS_ORDER.indexOf(task.status);
    const next = STATUS_ORDER[Math.max(0, Math.min(STATUS_ORDER.length - 1, current + direction))];
    if (next === task.status) return;
    try {
      await updateTaskFn({ data: { accessKey, id: task.id, status: next } });
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: next } : item));
      toast.success(`Tarefa movida para ${STATUS_LABEL[next]}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa.");
    }
  }

  async function removeWorkflow(workflow: AgencyWorkflow) {
    const accessKey = getAccessKey();
    if (!accessKey || !confirm(`Excluir o plano “${workflow.title}” e as tarefas ligadas a ele?`)) return;
    try {
      await deleteWorkflowFn({ data: { accessKey, id: workflow.id } });
      if (selectedResult?.id === workflow.id) setSelectedResult(null);
      await refresh();
      toast.success("Plano removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o plano.");
    }
  }

  return (
    <AppShell>
      <div className="page-wrap space-y-7 pb-16">
        <section className="agency-hero panel relative overflow-hidden p-6 sm:p-8 xl:p-10">
          <div className="agency-hero-grid" aria-hidden="true" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_420px] xl:items-end">
            <div>
              <div className="eyebrow mb-4 flex items-center gap-2"><BriefcaseBusiness className="h-3.5 w-3.5 text-primary" /> Zunexi Agency OS</div>
              <h1 className="section-title max-w-4xl text-4xl leading-[.95] tracking-[-.055em] sm:text-6xl xl:text-7xl">UMA AGÊNCIA INTEIRA.<br /><span className="text-outline-brand">EM UM ÚNICO SISTEMA.</span></h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">Estratégia, branding, conteúdo, mídia, SEO, CRM, automação, growth e operação. Cada plano vira tarefas e fica salvo no Supabase por cliente.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => setProjectFormOpen(true)} className="primary-button"><Plus className="h-4 w-4" /> Novo cliente/projeto</button>
                <button onClick={() => { setView("tasks"); document.getElementById("agency-board")?.scrollIntoView({ behavior: "smooth" }); }} className="secondary-button"><ListChecks className="h-4 w-4" /> Ver tarefas</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AgencyMetric icon={Building2} value={projects.length} label="Clientes/projetos" />
              <AgencyMetric icon={Sparkles} value={workflows.length} label="Planos gerados" />
              <AgencyMetric icon={ClipboardList} value={projectTasks.length} label="Tarefas" />
              <AgencyMetric icon={CheckCircle2} value={`${progress}%`} label="Execução" />
            </div>
          </div>
        </section>

        <section className="panel p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Projeto ativo</div>
              <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="app-input min-w-0 flex-1 sm:max-w-xl">
                <option value="">Operação geral da empresa</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => refresh().catch(() => undefined)} className="secondary-button"><RefreshCcw className="h-4 w-4" /> Atualizar</button>
              {selectedProject && <button onClick={() => removeProject(selectedProject)} className="secondary-button text-red-500 dark:text-red-300"><Trash2 className="h-4 w-4" /> Excluir projeto</button>}
            </div>
          </div>
          {selectedProject && <div className="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2 xl:grid-cols-4"><MiniInfo label="Objetivo" value={selectedProject.objective || "Não informado"} /><MiniInfo label="Público" value={selectedProject.audience || "Não informado"} /><MiniInfo label="Canais" value={selectedProject.channels || "Não informado"} /><MiniInfo label="Orçamento" value={selectedProject.budget || "Não informado"} /></div>}
        </section>

        <div className="flex flex-wrap gap-2">
          <ViewButton active={view === "services"} onClick={() => setView("services")} icon={LayoutGrid}>Serviços</ViewButton>
          <ViewButton active={view === "tasks"} onClick={() => setView("tasks")} icon={ListChecks}>Operação</ViewButton>
          <ViewButton active={view === "history"} onClick={() => setView("history")} icon={Clock3}>Histórico</ViewButton>
        </div>

        {view === "services" && <>
          <section>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div><div className="eyebrow mb-2">29 áreas operacionais</div><h2 className="section-title text-2xl sm:text-3xl">Serviços da agência</h2><p className="mt-2 text-sm text-muted-foreground">Escolha uma área para a Zunexi montar o plano e transformar em execução.</p></div>
              <div className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar serviço..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3"><Filter className="h-4 w-4 text-muted-foreground" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="bg-transparent py-2.5 text-sm outline-none"><option>Todos</option>{AGENCY_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleModules.map((item, index) => <ServiceCard key={item.id} item={item} index={index} active={item.id === selectedModule} onSelect={() => selectModule(item.id)} />)}
            </div>
          </section>

          <section id="agency-workbench" className="panel scroll-mt-24 overflow-hidden">
            <div className="grid xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="border-b border-border/80 p-5 sm:p-6 xl:border-b-0 xl:border-r">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary"><WandSparkles className="h-5 w-5" /></div>
                <div className="mt-5 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">{module.category}</div>
                <h2 className="section-title mt-2 text-2xl">{module.name}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{module.description}</p>
                <div className="mt-5 space-y-2">{module.outputs.map((output) => <div key={output} className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {output}</div>)}</div>
                {module.route && <Link to={module.route as any} className="secondary-button mt-6 w-full justify-center">Abrir ferramenta relacionada <ArrowRight className="h-4 w-4" /></Link>}
              </div>
              <div className="p-5 sm:p-6 xl:p-8">
                <div className="grid gap-5 lg:grid-cols-2">
                  <label className="lg:col-span-2"><span className="app-label">Nome do plano</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input mt-2 w-full" placeholder="Ex.: Estratégia Q4 — Cliente X" /></label>
                  <label className="lg:col-span-2"><span className="app-label">O que precisamos resolver?</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={7} className="app-input mt-2 w-full resize-y" placeholder="Descreva o cenário atual, problema, meta, restrições e qualquer informação que a IA precisa considerar. Quanto mais contexto real, melhor o plano." /></label>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs leading-5 text-muted-foreground">A geração usa o contexto do projeto selecionado e o Brand Kit vinculado, quando houver.</div>
                  <button onClick={generate} disabled={generating} className="primary-button shrink-0 disabled:cursor-not-allowed disabled:opacity-60">{generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando plano...</> : <><Sparkles className="h-4 w-4" /> Gerar e criar tarefas</>}</button>
                </div>
              </div>
            </div>
          </section>
        </>}

        {view === "tasks" && <section id="agency-board" className="scroll-mt-24">
          <div className="mb-4 flex items-end justify-between"><div><div className="eyebrow mb-2">Execução</div><h2 className="section-title text-2xl sm:text-3xl">Quadro operacional</h2><p className="mt-2 text-sm text-muted-foreground">Toda estratégia gerada vira trabalho acompanhável.</p></div><div className="hidden text-right sm:block"><div className="text-3xl font-bold tracking-[-.05em]">{progress}%</div><div className="text-xs text-muted-foreground">concluído</div></div></div>
          {loading ? <LoadingPanel /> : projectTasks.length === 0 ? <EmptyPanel title="Nenhuma tarefa ainda" text="Gere um plano em qualquer serviço para criar automaticamente o backlog operacional." action={() => setView("services")} actionLabel="Escolher serviço" /> : <div className="grid gap-4 xl:grid-cols-4">{STATUS_ORDER.map((status) => <TaskColumn key={status} status={status} tasks={projectTasks.filter((task) => task.status === status)} onMove={moveTask} />)}</div>}
        </section>}

        {view === "history" && <section>
          <div className="mb-4"><div className="eyebrow mb-2">Memória operacional</div><h2 className="section-title text-2xl sm:text-3xl">Histórico de planos</h2><p className="mt-2 text-sm text-muted-foreground">Reabra qualquer estratégia criada anteriormente.</p></div>
          {loading ? <LoadingPanel /> : projectWorkflows.length === 0 ? <EmptyPanel title="Nenhum plano gerado" text="Os planos criados pela Agência 360 aparecerão aqui." action={() => setView("services")} actionLabel="Criar primeiro plano" /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projectWorkflows.map((workflow) => <article key={workflow.id} className="panel p-5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><FileText className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-[10px] uppercase tracking-[.16em] text-primary">{getAgencyModule(workflow.module).name}</div><h3 className="mt-1 line-clamp-2 font-semibold">{workflow.title}</h3><p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{workflow.summary}</p></div></div><div className="mt-5 flex gap-2 border-t border-border pt-4"><button onClick={() => setSelectedResult(workflow)} className="secondary-button flex-1 justify-center text-xs">Abrir plano</button><button onClick={() => removeWorkflow(workflow)} className="rounded-xl border border-border p-2.5 text-muted-foreground hover:border-red-500/35 hover:bg-red-500/8 hover:text-red-500" title="Excluir plano"><Trash2 className="h-4 w-4" /></button></div></article>)}</div>}
        </section>}
      </div>

      {projectFormOpen && <Modal title="Novo cliente ou projeto" onClose={() => setProjectFormOpen(false)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome" className="sm:col-span-2"><input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} className="app-input w-full" placeholder="Ex.: Hamburgueria Centro" autoFocus /></FormField>
          <FormField label="Objetivo"><input value={projectForm.objective} onChange={(event) => setProjectForm({ ...projectForm, objective: event.target.value })} className="app-input w-full" placeholder="Ex.: aumentar pedidos" /></FormField>
          <FormField label="Público"><input value={projectForm.audience} onChange={(event) => setProjectForm({ ...projectForm, audience: event.target.value })} className="app-input w-full" placeholder="Ex.: 18–35 anos em Barueri" /></FormField>
          <FormField label="Canais"><input value={projectForm.channels} onChange={(event) => setProjectForm({ ...projectForm, channels: event.target.value })} className="app-input w-full" placeholder="Instagram, Google, WhatsApp..." /></FormField>
          <FormField label="Orçamento"><input value={projectForm.budget} onChange={(event) => setProjectForm({ ...projectForm, budget: event.target.value })} className="app-input w-full" placeholder="Ex.: R$ 3.000/mês" /></FormField>
          <FormField label="Site" className="sm:col-span-2"><input value={projectForm.website} onChange={(event) => setProjectForm({ ...projectForm, website: event.target.value })} className="app-input w-full" placeholder="https://..." /></FormField>
        </div>
        <div className="mt-6 flex justify-end gap-2"><button onClick={() => setProjectFormOpen(false)} className="secondary-button">Cancelar</button><button onClick={saveProject} disabled={projectSaving || !projectForm.name.trim()} className="primary-button disabled:opacity-50">{projectSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar projeto</button></div>
      </Modal>}

      {selectedResult && <ResultDrawer workflow={selectedResult} onClose={() => setSelectedResult(null)} onDelete={() => removeWorkflow(selectedResult)} />}
    </AppShell>
  );
}

function AgencyMetric({ icon: Icon, value, label }: { icon: ComponentType<{ className?: string }>; value: string | number; label: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl"><div className="flex items-center justify-between"><Icon className="h-4 w-4 text-primary" /><span className="text-2xl font-bold tracking-[-.04em]">{value}</span></div><div className="mt-5 text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</div></div>;
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-medium" title={value}>{value}</div></div>;
}

function ViewButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${active ? "border-primary/40 bg-primary/12 text-foreground" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{children}</button>;
}

function ServiceCard({ item, index, active, onSelect }: { item: (typeof AGENCY_MODULES)[number]; index: number; active: boolean; onSelect: () => void }) {
  const icons = [Target, Megaphone, UsersRound, BarChart3, Globe2, Zap, Activity, ClipboardList];
  const Icon = icons[index % icons.length];
  return <button onClick={onSelect} className={`group min-h-52 rounded-[1.35rem] border p-5 text-left transition duration-300 ${active ? "border-primary/45 bg-primary/[.075] shadow-[0_18px_55px_rgba(77,107,255,.10)]" : "border-border bg-card/60 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card"}`}><div className="flex items-start justify-between"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${active ? "bg-primary/18 text-primary" : "bg-secondary text-muted-foreground group-hover:text-primary"}`}><Icon className="h-4.5 w-4.5" /></div><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{item.category}</span></div><h3 className="mt-5 text-base font-semibold">{item.name}</h3><p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.description}</p><div className="mt-5 flex items-center gap-1 text-xs font-semibold text-primary">Executar serviço <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></div></button>;
}

function TaskColumn({ status, tasks, onMove }: { status: AgencyTask["status"]; tasks: AgencyTask[]; onMove: (task: AgencyTask, direction: 1 | -1) => void }) {
  const icon = status === "done" ? CheckCircle2 : status === "in_progress" ? Play : status === "review" ? Search : CircleDashed;
  const Icon = icon;
  return <div className="rounded-[1.35rem] border border-border bg-card/45 p-3"><div className="flex items-center justify-between px-2 py-2"><div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {STATUS_LABEL[status]}</div><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{tasks.length}</span></div><div className="mt-2 space-y-3">{tasks.map((task) => <div key={task.id} className="rounded-2xl border border-border bg-background/60 p-4"><div className="flex items-start justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${task.priority === "urgent" ? "bg-red-500/12 text-red-500 dark:text-red-300" : task.priority === "high" ? "bg-amber-500/12 text-amber-600 dark:text-amber-300" : "bg-primary/10 text-primary"}`}>{PRIORITY_LABEL[task.priority]}</span>{task.due_date && <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><CalendarClock className="h-3 w-3" /> {new Date(`${task.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</span>}</div><h4 className="mt-3 text-sm font-semibold leading-5">{task.title}</h4>{task.description && <p className="mt-2 line-clamp-4 text-[11px] leading-5 text-muted-foreground">{task.description}</p>}<div className="mt-4 flex gap-2 border-t border-border/70 pt-3">{status !== "backlog" && <button onClick={() => onMove(task, -1)} className="secondary-button flex-1 justify-center px-2 py-2 text-[10px]">Voltar</button>}{status !== "done" && <button onClick={() => onMove(task, 1)} className="primary-button flex-1 justify-center px-2 py-2 text-[10px]">{status === "review" ? "Concluir" : "Avançar"} <ArrowRight className="h-3 w-3" /></button>}</div></div>)}</div></div>;
}

function LoadingPanel() {
  return <div className="panel grid min-h-56 place-items-center"><div className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /><div className="mt-3 text-sm text-muted-foreground">Carregando operação...</div></div></div>;
}

function EmptyPanel({ title, text, action, actionLabel }: { title: string; text: string; action: () => void; actionLabel: string }) {
  return <div className="panel flex min-h-64 flex-col items-center justify-center border-dashed p-8 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 text-primary"><BriefcaseBusiness className="h-5 w-5" /></div><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 max-w-lg text-sm text-muted-foreground">{text}</p><button onClick={action} className="primary-button mt-5">{actionLabel}</button></div>;
}

function FormField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><span className="app-label">{label}</span><div className="mt-2">{children}</div></label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="w-full max-w-2xl rounded-[1.5rem] border border-border bg-popover p-5 shadow-2xl sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.16em] text-primary">Agência 360</div><h2 className="mt-1 text-xl font-semibold">{title}</h2></div><button onClick={onClose} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>{children}</div></div>;
}

function ResultDrawer({ workflow, onClose, onDelete }: { workflow: AgencyWorkflow; onClose: () => void; onDelete: () => void }) {
  const result = workflow.result || {};
  return <div className="fixed inset-0 z-[85] bg-black/55 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="absolute inset-y-0 right-0 w-full max-w-3xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[.16em] text-primary">{getAgencyModule(workflow.module).name}</div><h2 className="section-title mt-2 text-2xl sm:text-3xl">{workflow.title}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{result.summary || workflow.summary}</p></div><button onClick={onClose} className="rounded-xl border border-border p-2.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div><div className="mt-7 space-y-5"><ResultSection title="Diagnóstico" items={result.diagnosis} /><ResultSection title="Estratégia" items={result.strategy} /><ResultSection title="Entregáveis" items={result.deliverables} /><ResultSection title="KPIs" items={result.kpis} /><ResultSection title="Riscos e cuidados" items={result.risks} /><ResultSection title="Recomendações" items={result.recommendations} /></div><div className="mt-8 flex justify-end border-t border-border pt-5"><button onClick={onDelete} className="secondary-button text-red-500 dark:text-red-300"><Trash2 className="h-4 w-4" /> Excluir plano</button></div></aside></div>;
}

function ResultSection({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return <section className="rounded-2xl border border-border bg-card/55 p-5"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-3 space-y-2">{items.map((item, index) => <div key={`${title}-${index}`} className="flex gap-3 text-sm leading-6 text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{item}</span></div>)}</div></section>;
}
