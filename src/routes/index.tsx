import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clock3,
  FileText,
  FolderOpen,
  ImagePlus,
  Images,
  Library,
  MoreHorizontal,
  Plus,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { loadLibrary, loadProjects, subscribeLibrary, subscribeProjects, type Project } from "@/lib/storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Zunexi.ai" },
      { name: "description", content: "Painel do estúdio criativo Zunexi.ai." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [imageCount, setImageCount] = useState(0);

  useEffect(() => {
    const refreshProjects = () => setProjects(loadProjects());
    const refreshLibrary = () => setImageCount(loadLibrary().length);
    refreshProjects();
    refreshLibrary();
    const stopProjects = subscribeProjects(refreshProjects);
    const stopLibrary = subscribeLibrary(refreshLibrary);
    return () => {
      stopProjects();
      stopLibrary();
    };
  }, []);

  const slides = useMemo(() => projects.reduce((sum, project) => sum + project.slides.length, 0), [projects]);
  const recent = projects.slice(0, 4);

  return (
    <AppShell>
      <div className="page-wrap space-y-8">
        <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
           
            <h1 className="section-title text-3xl sm:text-4xl">Bem-vindo(a) de volta </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Crie carrosséis, cartazes e artes profissionais para Instagram em poucos minutos.
            </p>
          </div>
          <Link to="/carrossel" className="primary-button self-start xl:self-auto"><Plus className="h-4 w-4" /> Criar novo conteúdo</Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={FolderOpen} value={projects.length} label="Projetos" note="salvos neste dispositivo" />
          <Metric icon={Images} value={imageCount} label="Imagens" note="na sua biblioteca" />
          <Metric icon={FileText} value={slides} label="Conteúdos" note="páginas e slides criados" />
          <Metric icon={Clock3} value={`${Math.max(1, Math.round(slides * 0.18))}h`} label="Tempo economizado" note="estimativa de produção" />
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="section-title text-xl">Ações rápidas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Escolha o formato e comece a criar.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ActionCard to="/carrossel" icon={Images} title="Carrossel" description="Crie sequências de slides com texto e imagens gerados por IA." />
            <ActionCard to="/cartaz" icon={ImagePlus} title="Cartaz" description="Monte artes de eventos com composição visual profissional." />
            <ActionCard to="/projetos" icon={FolderOpen} title="Meus projetos" description="Continue editando, duplique ou exporte seus trabalhos." />
            <ActionCard to="/biblioteca" icon={Library} title="Biblioteca" description="Organize imagens, uploads e fontes favoritas." />
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="section-title text-xl">Projetos recentes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Continue de onde parou.</p>
            </div>
            <Link to="/projetos" className="flex items-center gap-1 text-sm font-medium text-primary hover:text-accent">Ver todos <ArrowRight className="h-4 w-4" /></Link>
          </div>

          {recent.length === 0 ? (
            <div className="panel flex min-h-56 flex-col items-center justify-center border-dashed p-8 text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><WandSparkles className="h-6 w-6" /></div>
              <h3 className="font-semibold">Nenhum projeto criado ainda</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Sua galeria aparecerá aqui depois que você gerar o primeiro carrossel ou cartaz.</p>
              <Link to="/carrossel" className="primary-button mt-5">Criar primeiro projeto</Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {recent.map((project) => (
                <article key={project.id} className="panel group overflow-hidden">
                  <Link to="/editor/$id" params={{ id: project.id }} className="block aspect-[4/3] overflow-hidden bg-secondary">
                    {project.slides[0]?.thumb ? (
                      <img src={project.slides[0].thumb} alt={project.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,.35),transparent_40%),linear-gradient(135deg,#17122a,#07101f)]">
                        <Sparkles className="h-9 w-9 text-primary" />
                      </div>
                    )}
                  </Link>
                  <div className="p-4">
                    <div className="flex gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">{project.type} · Editado {formatRelative(project.updatedAt)}</p>
                      </div>
                      <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white"><MoreHorizontal className="h-4 w-4" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel relative overflow-hidden p-5 sm:p-6">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(124,58,237,.22),transparent_65%)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Sparkles className="h-5 w-5" /></div>
              <div>
                <h3 className="font-semibold">Dica Zunexi.ai</h3>
                <p className="mt-1 text-sm text-muted-foreground">Quanto mais detalhes você fornecer, mais alinhado será o conteúdo criado pela IA.</p>
              </div>
            </div>
            <Link to="/carrossel" className="secondary-button shrink-0">Criar com IA <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, value, label, note }: { icon: React.ComponentType<{ className?: string }>; value: string | number; label: string; note: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/15 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          <div className="text-sm font-medium">{label}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, description }: { to: string; icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <Link to={to} className="panel group relative overflow-hidden p-5 hover:-translate-y-0.5 hover:border-primary/45">
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/15 blur-2xl opacity-0 transition group-hover:opacity-100" />
      <div className="relative flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Começar <ArrowRight className="h-3.5 w-3.5" /></span>
        </div>
      </div>
    </Link>
  );
}

function formatRelative(timestamp: number) {
  const diffHours = Math.floor((Date.now() - timestamp) / 3_600_000);
  if (diffHours < 1) return "agora";
  if (diffHours < 24) return `há ${diffHours}h`;
  const days = Math.floor(diffHours / 24);
  return `há ${days}d`;
}
