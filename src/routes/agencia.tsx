import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock3,
  Layers3,
  ListChecks,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AgencySectionNav } from "@/components/agency/AgencySectionNav";
import { AGENCY_CATEGORIES, AGENCY_MODULES } from "@/lib/agency-catalog";
import { listAgencyProjects, listAgencyTasks, listAgencyWorkflows } from "@/lib/agency.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/agencia")({
  head: () => ({
    meta: [
      { title: "Agência 360 — Zunexi.ai" },
      { name: "description", content: "Central organizada dos serviços de marketing da Zunexi.ai." },
    ],
  }),
  component: AgencyHome,
});

type AgencyProject = { id: string; name: string; status: string };
type AgencyTask = { id: string; status: "backlog" | "in_progress" | "review" | "done" };
type AgencyWorkflow = { id: string; module: string; created_at: string };

function AgencyHome() {
  const listProjectsFn = useServerFn(listAgencyProjects);
  const listTasksFn = useServerFn(listAgencyTasks);
  const listWorkflowsFn = useServerFn(listAgencyWorkflows);
  const [projects, setProjects] = useState<AgencyProject[]>([]);
  const [tasks, setTasks] = useState<AgencyTask[]>([]);
  const [workflows, setWorkflows] = useState<AgencyWorkflow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accessKey = getAccessKey();
    if (!accessKey) return;
    Promise.all([
      listProjectsFn({ data: { accessKey } }),
      listTasksFn({ data: { accessKey } }),
      listWorkflowsFn({ data: { accessKey } }),
    ])
      .then(([projectRows, taskRows, workflowRows]) => {
        setProjects(projectRows as AgencyProject[]);
        setTasks(taskRows as AgencyTask[]);
        setWorkflows(workflowRows as AgencyWorkflow[]);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar a Agência 360."))
      .finally(() => setLoading(false));
  }, []);

  const visibleModules = useMemo(() => {
    const value = query.trim().toLowerCase();
    return AGENCY_MODULES.filter((module) => {
      const matchesCategory = category === "Todos" || module.category === category;
      const matchesSearch = !value || `${module.name} ${module.description} ${module.outputs.join(" ")}`.toLowerCase().includes(value);
      return matchesCategory && matchesSearch;
    });
  }, [category, query]);

  const openTasks = tasks.filter((task) => task.status !== "done").length;
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const completion = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <AppShell>
      <div className="page-wrap space-y-6 pb-16">
        <AgencySectionNav />

        <section className="panel relative overflow-hidden p-6 sm:p-8 xl:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_420px] xl:items-end">
            <div>
              <div className="eyebrow mb-4 flex items-center gap-2"><BriefcaseBusiness className="h-3.5 w-3.5 text-primary" /> Zunexi Agency OS</div>
              <h1 className="section-title max-w-4xl text-4xl leading-[.98] tracking-[-.055em] sm:text-6xl">Agência 360</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">Cada área da agência agora possui sua própria página, briefing, histórico e tarefas. Use esta tela apenas para acompanhar a operação e escolher qual serviço abrir.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/agencia/clientes" className="primary-button"><Building2 className="h-4 w-4" /> Gerenciar clientes</Link>
                <Link to="/agencia/tarefas" className="secondary-button"><ListChecks className="h-4 w-4" /> Abrir tarefas</Link>
                <Link to="/agencia/historico" className="secondary-button"><Clock3 className="h-4 w-4" /> Ver histórico</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric icon={Building2} value={projects.length} label="Clientes" />
              <Metric icon={Sparkles} value={workflows.length} label="Planos gerados" />
              <Metric icon={ListChecks} value={openTasks} label="Tarefas abertas" />
              <Metric icon={CheckCircle2} value={`${completion}%`} label="Execução" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Link to="/agencia/clientes" className="panel group p-5 hover:border-primary/35">
            <div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary"><Building2 className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></div>
            <h2 className="section-title mt-5 text-lg">Clientes e projetos</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Cadastre empresas, objetivos, público, canais, orçamento e site.</p>
          </Link>
          <Link to="/agencia/tarefas" className="panel group p-5 hover:border-primary/35">
            <div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent"><ListChecks className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></div>
            <h2 className="section-title mt-5 text-lg">Operação e tarefas</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Acompanhe backlog, execução, revisão e conclusão de todos os serviços.</p>
          </Link>
          <Link to="/agencia/historico" className="panel group p-5 hover:border-primary/35">
            <div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary"><BarChart3 className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></div>
            <h2 className="section-title mt-5 text-lg">Histórico estratégico</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Consulte todos os planos gerados por serviço e por cliente.</p>
          </Link>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div><div className="eyebrow mb-2 flex items-center gap-2"><Layers3 className="h-3.5 w-3.5 text-primary" /> Áreas da agência</div><h2 className="section-title text-2xl">Escolha uma função</h2><p className="mt-1 text-sm text-muted-foreground">Cada cartão abre uma página exclusiva daquele serviço.</p></div>
            <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5 sm:w-72"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar serviço..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="app-input sm:w-48"><option>Todos</option>{AGENCY_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
            </div>
          </div>

          {loading ? <div className="panel grid min-h-48 place-items-center text-sm text-muted-foreground">Carregando operação...</div> : visibleModules.length === 0 ? <div className="panel grid min-h-48 place-items-center text-sm text-muted-foreground">Nenhum serviço encontrado.</div> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleModules.map((module) => {
                const modulePlans = workflows.filter((workflow) => workflow.module === module.id).length;
                return (
                  <Link key={module.id} to="/agencia/$modulo" params={{ modulo: module.slug }} className="panel group overflow-hidden p-5 hover:-translate-y-0.5 hover:border-primary/35">
                    <div className="flex items-start justify-between gap-4"><div><span className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-primary">{module.category}</span><h3 className="section-title mt-4 text-lg">{module.name}</h3></div><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-secondary/60 text-muted-foreground transition group-hover:border-primary/30 group-hover:text-primary"><ArrowRight className="h-4 w-4" /></div></div>
                    <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">{module.description}</p>
                    <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4"><span className="text-xs text-muted-foreground">{modulePlans} {modulePlans === 1 ? "plano criado" : "planos criados"}</span><span className="flex items-center gap-1 text-xs font-semibold text-primary">Abrir página <ArrowRight className="h-3.5 w-3.5" /></span></div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><Target className="h-5 w-5" /></div><div><h2 className="section-title text-lg">Fluxo mais simples</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">1. Cadastre o cliente. 2. Abra a função desejada. 3. Gere o plano com IA. 4. Acompanhe as tarefas na página de operação. 5. Consulte qualquer plano depois no histórico.</p></div></div>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: string | number; label: string }) {
  return <div className="rounded-2xl border border-border/80 bg-black/10 p-4 dark:bg-black/20"><Icon className="h-4 w-4 text-primary" /><div className="mt-4 text-2xl font-bold tracking-[-.04em]">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{label}</div></div>;
}
