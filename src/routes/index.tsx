import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  ImagePlus,
  Images,
  Inbox,
  LayoutGrid,
  Library,
  Plus,
  Send,
  Share2,
  Sparkles,
  WandSparkles,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getAccessCreditStatus, type CreditStatus } from "@/lib/access.functions";
import { listScheduledPosts } from "@/lib/planner.functions";
import { getSocialDashboardSummary } from "@/lib/social.functions";
import { listAgencyProjects, listAgencyTasks, listAgencyWorkflows } from "@/lib/agency.functions";
import { getAccessKey, getAccessUserName } from "@/lib/session";
import { loadLibrary, loadProjects, subscribeLibrary, subscribeProjects, type Project } from "@/lib/storage";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Zunexi.ai" },
      { name: "description", content: "Central de criação, marketing e operação da Zunexi.ai." },
    ],
  }),
  component: Dashboard,
});

type ScheduledPost = Database["public"]["Tables"]["scheduled_posts"]["Row"];

function Dashboard() {
  const navigate = useNavigate();
  const getStatus = useServerFn(getAccessCreditStatus);
  const getSchedule = useServerFn(listScheduledPosts);
  const getSocialSummary = useServerFn(getSocialDashboardSummary);
  const listAgencyProjectsFn = useServerFn(listAgencyProjects);
  const listAgencyTasksFn = useServerFn(listAgencyTasks);
  const listAgencyWorkflowsFn = useServerFn(listAgencyWorkflows);
  const [projects, setProjects] = useState<Project[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [upcoming, setUpcoming] = useState<ScheduledPost[]>([]);
  const [userName, setUserName] = useState("Usuário Zunexi.ai");
  const [social, setSocial] = useState<{ connectedAccounts: number; scheduledNext7Days: number; pendingReview: number; openInbox: number } | null>(null);
  const [agency, setAgency] = useState({ projects: 0, workflows: 0, tasks: 0, done: 0 });

  useEffect(() => {
    const refreshProjects = () => setProjects(loadProjects());
    const refreshLibrary = () => setImageCount(loadLibrary().length);
    refreshProjects();
    refreshLibrary();
    const stopProjects = subscribeProjects(refreshProjects);
    const stopLibrary = subscribeLibrary(refreshLibrary);
    return () => { stopProjects(); stopLibrary(); };
  }, []);

  useEffect(() => {
    setUserName(getAccessUserName());
    const key = getAccessKey();
    if (!key) return;
    getStatus({ data: { key } }).then(async (nextStatus) => {
      setStatus(nextStatus);
      const jobs: Promise<unknown>[] = [];
      if (nextStatus.features.includes("agenda")) {
        const now = new Date();
        jobs.push(getSchedule({ data: { accessKey: key, from: startOfMonth(now).toISOString(), to: addMonths(endOfMonth(now), 2).toISOString() } }).then((rows) => setUpcoming((rows as ScheduledPost[]).filter((item) => parseISO(item.scheduled_for).getTime() >= Date.now()).slice(0, 5))));
      }
      if (nextStatus.features.includes("gestao_redes")) jobs.push(getSocialSummary({ data: { accessKey: key } }).then((summary) => setSocial(summary)));
      jobs.push(Promise.all([
        listAgencyProjectsFn({ data: { accessKey: key } }),
        listAgencyWorkflowsFn({ data: { accessKey: key } }),
        listAgencyTasksFn({ data: { accessKey: key } }),
      ]).then(([clientRows, workflowRows, taskRows]) => {
        const taskList = taskRows as Array<{ status?: string }>;
        setAgency({ projects: clientRows.length, workflows: workflowRows.length, tasks: taskList.length, done: taskList.filter((item) => item.status === "done").length });
      }));
      await Promise.allSettled(jobs);
    }).catch(() => undefined);
  }, []);

  const slides = useMemo(() => projects.reduce((sum, project) => sum + project.slides.length, 0), [projects]);
  const recent = projects.slice(0, 4);
  const usedPercent = status?.unlimited ? 0 : Math.min(100, Math.round(((status?.usedThisMonth || 0) / Math.max(status?.creditsPerMonth || 1, 1)) * 100));
  const agencyProgress = agency.tasks ? Math.round((agency.done / agency.tasks) * 100) : 0;

  return (
    <AppShell>
      <div className="page-wrap space-y-7 pb-16">
        <section className="panel relative overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_78%_12%,rgba(139,92,246,.18),transparent_25%),radial-gradient(circle_at_10%_100%,rgba(77,107,255,.16),transparent_30%)] p-6 sm:p-9 xl:p-11">
          <div className="relative grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_390px] xl:items-end">
            <div>
              <div className="eyebrow mb-4 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> Zunexi Marketing OS</div>
              <h1 className="section-title max-w-5xl text-5xl leading-[.88] tracking-[-.065em] sm:text-7xl xl:text-[88px]">CRIE.<br /><span className="text-outline-brand">GERENCIE.</span><br />CRESÇA.</h1>
              <p className="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground">Olá, <strong className="text-foreground">{userName}</strong>. Agora a Zunexi reúne criação, agência, redes sociais, analytics e execução em um único fluxo operacional.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/agencia" className="primary-button"><BriefcaseBusiness className="h-4 w-4" /> Abrir Agência 360</Link>
                <Link to="/carrossel" className="secondary-button"><Plus className="h-4 w-4" /> Criar conteúdo</Link>
                {status?.features.includes("agenda") && <Link to="/agenda" className="secondary-button"><CalendarDays className="h-4 w-4" /> Planejar posts</Link>}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[.2em] text-muted-foreground">Plano atual</div><div className="mt-1 text-2xl font-bold">{status?.planName || "Carregando"}</div></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary"><Zap className="h-5 w-5" /></div></div>
              <div className="mt-7 flex items-end justify-between gap-4"><div><div className="text-4xl font-bold tracking-[-.06em]">{status?.unlimited ? "∞" : status?.remaining ?? "—"}</div><div className="mt-1 text-[11px] text-muted-foreground">créditos disponíveis</div></div><div className="text-right text-[11px] text-muted-foreground">{status?.unlimited ? "Uso ilimitado" : `${status?.usedThisMonth || 0} de ${status?.creditsPerMonth || 0} usados`}</div></div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8"><i className="block h-full rounded-full bg-gradient-to-r from-primary via-violet-400 to-accent transition-all" style={{ width: `${status?.unlimited ? 100 : usedPercent}%` }} /></div>
              <div className="mt-5 grid grid-cols-2 gap-2"><MiniStat value={agency.projects} label="clientes" /><MiniStat value={`${agencyProgress}%`} label="operação concluída" /></div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={BriefcaseBusiness} value={agency.projects} label="Projetos de agência" note={`${agency.workflows} planos estratégicos gerados`} />
          <Metric icon={CheckCircle2} value={`${agency.done}/${agency.tasks}`} label="Tarefas concluídas" note={`${agencyProgress}% do backlog operacional`} />
          <Metric icon={Share2} value={social?.connectedAccounts ?? 0} label="Redes conectadas" note={`${social?.scheduledNext7Days ?? 0} publicações próximas`} />
          <Metric icon={Inbox} value={social?.openInbox ?? 0} label="Atendimentos abertos" note={`${social?.pendingReview ?? 0} conteúdos em revisão`} />
        </section>

        <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div>
            <div className="mb-4 flex items-end justify-between gap-4"><div><div className="eyebrow mb-2">Fluxos principais</div><h2 className="section-title text-2xl">O que você quer fazer agora?</h2></div><Link to="/agencia" className="hidden items-center gap-1 text-sm font-semibold text-primary hover:text-accent sm:flex">Ver Agência 360 <ArrowRight className="h-4 w-4" /></Link></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ActionCard to="/agencia" icon={BriefcaseBusiness} title="Operar uma agência" description="29 áreas: estratégia, branding, SEO, mídia, CRM, growth, vendas e muito mais." accent />
              <ActionCard to="/carrossel" icon={Images} title="Criar carrossel" description="Roteiro, imagens, layout e edição em um único fluxo de criação." />
              <ActionCard to="/cartaz" icon={ImagePlus} title="Criar peça" description="Artes para campanhas, promoções, eventos e comunicação comercial." />
              <ActionCard to="/publicacoes" icon={Send} title="Publicar conteúdo" description="Aprovação, agendamento, canais e acompanhamento editorial." />
              <ActionCard to="/analytics" icon={BarChart3} title="Analisar desempenho" description="Métricas sociais, desempenho e recomendações para a próxima ação." />
              <ActionCard to="/brand-kit" icon={WandSparkles} title="Gerenciar marca" description="Manual, cores, tipografia, público e regras aplicadas automaticamente pela IA." />
              <ActionCard to="/biblioteca" icon={Library} title="Abrir biblioteca" description="Imagens e referências centralizadas para reutilização nos projetos." />
              <ActionCard to="/projetos" icon={FolderOpen} title="Meus projetos" description={`${projects.length} projetos criativos salvos e sincronizados.`} />
              <ActionCard to="/agenda" icon={CalendarDays} title="Calendário editorial" description="Organize datas, horários e conteúdo futuro." />
            </div>
          </div>

          <aside className="panel p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><div className="eyebrow mb-2">Agenda</div><h2 className="section-title text-xl">Próximas publicações</h2></div><CalendarDays className="h-5 w-5 text-primary" /></div>
            {upcoming.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center"><Clock3 className="mx-auto h-5 w-5 text-primary" /><p className="mt-3 text-xs leading-5 text-muted-foreground">Nenhuma publicação futura encontrada.</p><Link to="/agenda" className="primary-button mt-4 text-xs">Planejar conteúdo</Link></div> : <div className="mt-5 space-y-3">{upcoming.map((post) => <Link key={post.id} to="/agenda" className="flex items-start gap-3 rounded-xl border border-border p-3 hover:border-primary/35 hover:bg-primary/[.035]"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><span className="text-xs font-bold">{format(parseISO(post.scheduled_for), "dd")}</span></div><div className="min-w-0"><div className="truncate text-xs font-semibold">{post.title}</div><div className="mt-1 text-[10px] capitalize text-muted-foreground">{format(parseISO(post.scheduled_for), "dd/MM · HH:mm")} · {post.platform}</div></div></Link>)}</div>}
          </aside>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between"><div><div className="eyebrow mb-2">Produção criativa</div><h2 className="section-title text-2xl">Projetos recentes</h2><p className="mt-1 text-sm text-muted-foreground">Continue exatamente de onde parou.</p></div><Link to="/projetos" className="flex items-center gap-1 text-sm font-semibold text-primary">Ver todos <ArrowRight className="h-4 w-4" /></Link></div>
          {recent.length === 0 ? <div className="panel flex min-h-56 flex-col items-center justify-center border-dashed p-8 text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><WandSparkles className="h-6 w-6" /></div><h3 className="font-semibold">Nenhum projeto criado ainda</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Sua galeria aparecerá aqui depois da primeira criação.</p><Link to="/carrossel" className="primary-button mt-5">Criar primeiro projeto</Link></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{recent.map((project) => <article key={project.id} className="panel group overflow-hidden"><button onClick={() => navigate({ to: "/editor/$id", params: { id: project.id } })} className="block aspect-[4/3] w-full overflow-hidden bg-secondary text-left">{project.slides[0]?.thumb ? <img src={project.slides[0].thumb} alt={project.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,.35),transparent_40%),linear-gradient(135deg,#17122a,#07101f)]"><Sparkles className="h-9 w-9 text-primary" /></div>}</button><div className="p-4"><h3 className="truncate text-sm font-semibold">{project.name}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{project.type} · {project.slides.length} páginas</p><div className="mt-4 flex gap-2"><button onClick={() => navigate({ to: "/editor/$id", params: { id: project.id } })} className="primary-button flex-1 justify-center px-3 py-2 text-xs">Abrir projeto</button><Link to="/projetos" className="secondary-button px-3 py-2 text-xs"><LayoutGrid className="h-3.5 w-3.5" /></Link></div></div></article>)}</div>}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SmallMetric icon={FolderOpen} value={projects.length} label="Projetos criativos" />
          <SmallMetric icon={Images} value={imageCount} label="Imagens na biblioteca" />
          <SmallMetric icon={FileText} value={slides} label="Slides e peças" />
          <SmallMetric icon={Clock3} value={`${Math.max(1, Math.round(slides * 0.18))}h`} label="Tempo estimado economizado" />
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, value, label, note }: { icon: ComponentType<{ className?: string }>; value: string | number; label: string; note: string }) {
  return <div className="panel p-5"><div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary"><Icon className="h-4.5 w-4.5" /></div><div className="text-3xl font-bold tracking-[-.05em]">{value}</div></div><div className="mt-6 text-sm font-semibold">{label}</div><div className="mt-1 text-[11px] text-muted-foreground">{note}</div></div>;
}

function MiniStat({ value, label }: { value: string | number; label: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[.03] p-3"><div className="text-xl font-bold tracking-[-.04em]">{value}</div><div className="mt-1 text-[9px] uppercase tracking-[.14em] text-muted-foreground">{label}</div></div>;
}

function ActionCard({ to, icon: Icon, title, description, accent = false }: { to: any; icon: ComponentType<{ className?: string }>; title: string; description: string; accent?: boolean }) {
  return <Link to={to} className={`panel group min-h-48 p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary/35 ${accent ? "border-primary/25 bg-[radial-gradient(circle_at_100%_0%,rgba(139,92,246,.13),transparent_35%)]" : ""}`}><div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary"><Icon className="h-4.5 w-4.5" /></div><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></div><h3 className="mt-6 font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></Link>;
}

function SmallMetric({ icon: Icon, value, label }: { icon: ComponentType<{ className?: string }>; value: string | number; label: string }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-border bg-card/55 p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Icon className="h-4 w-4" /></div><div><div className="text-lg font-bold">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></div></div>;
}
