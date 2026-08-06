import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { format, parseISO, startOfMonth, endOfMonth, addMonths } from "date-fns";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock3,
  FileText,
  FolderOpen,
  ImagePlus,
  Inbox,
  Images,
  Library,
  LockKeyhole,
  MoreHorizontal,
  Palette,
  Send,
  Share2,
  Plus,
  Sparkles,
  WandSparkles,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getAccessCreditStatus, type CreditStatus } from "@/lib/access.functions";
import { listScheduledPosts } from "@/lib/planner.functions";
import { getSocialDashboardSummary } from "@/lib/social.functions";
import { getAccessKey, getAccessUserName } from "@/lib/session";
import { loadLibrary, loadProjects, subscribeLibrary, subscribeProjects, type Project } from "@/lib/storage";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Zunexi.ai" },
      { name: "description", content: "Painel do estúdio criativo Zunexi.ai." },
    ],
  }),
  component: Dashboard,
});

type ScheduledPost = Database["public"]["Tables"]["scheduled_posts"]["Row"];

function Dashboard() {
  const getStatus = useServerFn(getAccessCreditStatus);
  const getSchedule = useServerFn(listScheduledPosts);
  const getSocialSummary = useServerFn(getSocialDashboardSummary);
  const [projects, setProjects] = useState<Project[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [upcoming, setUpcoming] = useState<ScheduledPost[]>([]);
  const [userName, setUserName] = useState("Usuário Zunexi.ai");
  const [social, setSocial] = useState<{ connectedAccounts: number; scheduledNext7Days: number; pendingReview: number; openInbox: number } | null>(null);

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
      const tasks: Promise<unknown>[] = [];
      if (nextStatus.features.includes("agenda")) {
        const now = new Date();
        const end = addMonths(endOfMonth(now), 2);
        tasks.push(getSchedule({ data: { accessKey: key, from: startOfMonth(now).toISOString(), to: end.toISOString() } }).then((rows) => setUpcoming((rows as ScheduledPost[]).filter((item) => parseISO(item.scheduled_for).getTime() >= Date.now()).slice(0, 4))));
      }
      if (nextStatus.features.includes("gestao_redes")) {
        tasks.push(getSocialSummary({ data: { accessKey: key } }).then((summary) => setSocial(summary)));
      }
      await Promise.allSettled(tasks);
    }).catch(() => undefined);
  }, []);

  const slides = useMemo(() => projects.reduce((sum, project) => sum + project.slides.length, 0), [projects]);
  const recent = projects.slice(0, 4);
  const usedPercent = status?.unlimited ? 0 : Math.min(100, Math.round(((status?.usedThisMonth || 0) / Math.max(status?.creditsPerMonth || 1, 1)) * 100));

  return (
    <AppShell>
      <div className="page-wrap space-y-7">
        <section className="dashboard-cinematic panel relative overflow-hidden p-6 sm:p-9 xl:p-11">
          <div className="dashboard-grid" />
          <div className="dashboard-orb" />
          <div className="relative grid gap-10 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)] xl:items-end">
            <div>
              <div className="eyebrow mb-4 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> Zunexi Creative OS</div>
              <h1 className="section-title max-w-4xl text-5xl leading-[.9] tracking-[-.065em] sm:text-7xl xl:text-[92px]">CRIE.<br /><span className="text-outline-brand">PLANEJE.</span><br />PUBLIQUE.</h1>
              <p className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground">Olá, <strong className="text-foreground">{userName}</strong>. Sua central de criação combina IA, identidade de marca e planejamento em um único fluxo.</p>
              <div className="mt-7 flex flex-wrap gap-3"><Link to="/carrossel" className="primary-button"><Plus className="h-4 w-4" /> Criar conteúdo</Link>{status?.features.includes("agenda") && <Link to="/agenda" className="secondary-button"><CalendarDays className="h-4 w-4" /> Abrir agenda</Link>}</div>
            </div>
            <div className="dashboard-plan-card rounded-[1.4rem] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.2em] text-muted-foreground">Plano atual</div><div className="mt-1 text-2xl font-bold">{status?.planName || "Carregando"}</div></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/40 to-accent/20 text-primary"><Zap className="h-5 w-5" /></div></div>
              <div className="mt-7 flex items-end justify-between"><div><div className="text-4xl font-bold tracking-[-.06em]">{status?.unlimited ? "∞" : status?.remaining ?? "—"}</div><div className="mt-1 text-[11px] text-muted-foreground">créditos disponíveis no mês</div></div><div className="text-right text-[11px] text-muted-foreground">{status?.unlimited ? "Uso ilimitado" : `${status?.usedThisMonth || 0} de ${status?.creditsPerMonth || 0} usados`}</div></div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8"><i className="block h-full rounded-full bg-gradient-to-r from-primary via-violet-400 to-accent transition-all" style={{ width: `${status?.unlimited ? 100 : usedPercent}%` }} /></div>
              <div className="mt-5 flex flex-wrap gap-2">{status?.priorityGeneration && <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Geração prioritária</span>}{status?.features.includes("agenda") && <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent">Agenda ativa</span>}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {status?.features.includes("gestao_redes") ? <>
            <Metric icon={Share2} value={social?.connectedAccounts ?? 0} label="Contas conectadas" note="redes prontas para sincronizar" />
            <Metric icon={Send} value={social?.scheduledNext7Days ?? 0} label="Próximas publicações" note="nos próximos sete dias" />
            <Metric icon={FileText} value={social?.pendingReview ?? 0} label="Aguardando revisão" note="conteúdos no fluxo editorial" />
            <Metric icon={Inbox} value={social?.openInbox ?? 0} label="Atendimentos abertos" note="mensagens e comentários" />
          </> : <>
            <Metric icon={FolderOpen} value={projects.length} label="Projetos" note="salvos neste dispositivo" />
            <Metric icon={Images} value={imageCount} label="Imagens" note="na sua biblioteca" />
            <Metric icon={FileText} value={slides} label="Conteúdos" note="páginas e slides criados" />
            <Metric icon={Clock3} value={`${Math.max(1, Math.round(slides * 0.18))}h`} label="Tempo economizado" note="estimativa de produção" />
          </>}
        </section>

        <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div>
            <div className="mb-4"><h2 className="section-title text-xl">Ações rápidas</h2><p className="mt-1 text-sm text-muted-foreground">Escolha o próximo movimento.</p></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {status?.features.includes("publicacoes") && <ActionCard to="/publicacoes" icon={Send} title="Publicações" description="Revise, aprove, agende e publique em um fluxo editorial completo." />}
              {status?.features.includes("gestao_redes") && <ActionCard to="/redes" icon={Share2} title="Redes conectadas" description="Gerencie contas, tokens, marcas e o estado de cada conexão." />}
              {status?.features.includes("caixa_entrada") && <ActionCard to="/caixa-entrada" icon={Inbox} title="Caixa de entrada" description="Responda mensagens e comentários em uma tela centralizada." />}
              {status?.features.includes("analytics") && <ActionCard to="/analytics" icon={BarChart3} title="Analytics" description="Sincronize métricas e gere recomendações estratégicas com IA." />}
              <ActionCard to="/carrossel" icon={Images} title="Carrossel" description="Crie sequências com narrativa, texto e imagens gerados por IA." />
              <ActionCard to="/cartaz" icon={ImagePlus} title="Cartaz" description="Monte artes de eventos e campanhas com composição profissional." />
              <ActionCard to="/biblioteca" icon={Library} title="Biblioteca" description="Organize imagens, uploads e referências da sua produção." />
              <ActionCard to="/agenda" icon={CalendarDays} title="Agenda de posts" description="Planeje datas, horários e o que você separou para publicar." locked={!status?.features.includes("agenda")} />
              <ActionCard to="/brand-kit" icon={Palette} title="Brand Kit" description="Mantenha cores, voz e estilo consistentes em cada criação." locked={!status?.features.includes("brand_kit")} />
              <ActionCard to="/criador-prompts" icon={WandSparkles} title="Criador de prompts" description="Transforme uma ideia simples em um briefing criativo completo." locked={!status?.features.includes("criador_prompts")} />
            </div>
          </div>

          <aside className="panel p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><h2 className="section-title text-xl">Próximos posts</h2><p className="mt-1 text-xs text-muted-foreground">Sua agenda pessoal.</p></div><CalendarDays className="h-5 w-5 text-primary" /></div>
            {!status?.features.includes("agenda") ? <div className="mt-5 rounded-xl border border-dashed border-border p-5 text-center"><LockKeyhole className="mx-auto h-5 w-5 text-primary" /><p className="mt-3 text-xs leading-5 text-muted-foreground">Agenda disponível nos planos Profissional e Agência.</p><Link to="/agenda" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">Conhecer recurso <ArrowRight className="h-3.5 w-3.5" /></Link></div> : upcoming.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border p-5 text-center"><p className="text-xs text-muted-foreground">Nenhuma postagem futura agendada.</p><Link to="/agenda" className="primary-button mt-4 text-xs">Criar planejamento</Link></div> : <div className="mt-5 space-y-3">{upcoming.map((post) => <Link key={post.id} to="/agenda" className="flex items-start gap-3 rounded-xl border border-border p-3 hover:border-primary/35 hover:bg-primary/[.035]"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><span className="text-xs font-bold">{format(parseISO(post.scheduled_for), "dd")}</span></div><div className="min-w-0"><div className="truncate text-xs font-semibold">{post.title}</div><div className="mt-1 text-[10px] capitalize text-muted-foreground">{format(parseISO(post.scheduled_for), "dd/MM · HH:mm")} · {post.platform}</div></div></Link>)}</div>}
          </aside>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="section-title text-xl">Projetos recentes</h2><p className="mt-1 text-sm text-muted-foreground">Continue de onde parou.</p></div><Link to="/projetos" className="flex items-center gap-1 text-sm font-medium text-primary hover:text-accent">Ver todos <ArrowRight className="h-4 w-4" /></Link></div>
          {recent.length === 0 ? <div className="panel flex min-h-56 flex-col items-center justify-center border-dashed p-8 text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><WandSparkles className="h-6 w-6" /></div><h3 className="font-semibold">Nenhum projeto criado ainda</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Sua galeria aparecerá aqui depois que você gerar o primeiro carrossel ou cartaz.</p><Link to="/carrossel" className="primary-button mt-5">Criar primeiro projeto</Link></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{recent.map((project) => <article key={project.id} className="panel group overflow-hidden"><Link to="/editor/$id" params={{ id: project.id }} className="block aspect-[4/3] overflow-hidden bg-secondary">{project.slides[0]?.thumb ? <img src={project.slides[0].thumb} alt={project.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,.35),transparent_40%),linear-gradient(135deg,#17122a,#07101f)]"><Sparkles className="h-9 w-9 text-primary" /></div>}</Link><div className="p-4"><div className="flex gap-3"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{project.name}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{project.type} · Editado {formatRelative(project.updatedAt)}</p></div><button className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white"><MoreHorizontal className="h-4 w-4" /></button></div></div></article>)}</div>}
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, value, label, note }: { icon: ComponentType<{ className?: string }>; value: string | number; label: string; note: string }) { return <div className="panel metric-card p-5"><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/15 text-primary"><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-bold tracking-tight">{value}</div><div className="text-sm font-medium">{label}</div><div className="mt-1 text-[11px] text-muted-foreground">{note}</div></div></div></div>; }

function ActionCard({ to, icon: Icon, title, description, locked }: { to: "/publicacoes" | "/redes" | "/caixa-entrada" | "/analytics" | "/carrossel" | "/cartaz" | "/biblioteca" | "/agenda" | "/brand-kit" | "/criador-prompts"; icon: ComponentType<{ className?: string }>; title: string; description: string; locked?: boolean }) { return <Link to={to} className="panel action-card group relative overflow-hidden p-5 hover:-translate-y-0.5 hover:border-primary/45"><div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/15 blur-2xl opacity-0 transition group-hover:opacity-100" /><div className="relative flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 text-primary"><Icon className="h-5 w-5" /></div><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="font-semibold">{title}</h3>{locked && <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />}</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">{locked ? "Ver planos" : "Começar"} <ArrowRight className="h-3.5 w-3.5" /></span></div></div></Link>; }

function formatRelative(timestamp: number) { const diffHours = Math.floor((Date.now() - timestamp) / 3_600_000); if (diffHours < 1) return "agora"; if (diffHours < 24) return `há ${diffHours}h`; return `há ${Math.floor(diffHours / 24)}d`; }
