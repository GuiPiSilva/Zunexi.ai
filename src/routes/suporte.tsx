import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  Layers3,
  LifeBuoy,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SupportChatPanel } from "@/components/SupportAssistant";
import {
  SUPPORT_ARTICLES,
  SUPPORT_CATEGORY_LABELS,
  type SupportArticle,
  type SupportCategory,
} from "@/lib/support-knowledge";

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte 24h — Zunexi.ai" },
      {
        name: "description",
        content: "Central de ajuda e suporte por IA da Zunexi.ai.",
      },
    ],
  }),
  component: SupportPage,
});

const CATEGORY_ICONS: Record<SupportCategory, typeof Sparkles> = {
  "primeiros-passos": Layers3,
  criacao: WandSparkles,
  marca: Sparkles,
  planejamento: Clock3,
  "redes-sociais": LifeBuoy,
  "conta-planos": ShieldCheck,
  erros: AlertTriangle,
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function SupportPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SupportCategory | "todas">("todas");
  const [selected, setSelected] = useState<SupportArticle | null>(null);

  const filtered = useMemo(() => {
    const search = normalize(query.trim());
    return SUPPORT_ARTICLES.filter((article) => {
      if (category !== "todas" && article.category !== category) return false;
      if (!search) return true;
      return normalize(
        [
          article.title,
          article.summary,
          ...article.keywords,
          ...article.steps,
        ].join(" "),
      ).includes(search);
    });
  }, [category, query]);

  const categories = Object.entries(SUPPORT_CATEGORY_LABELS) as Array<
    [SupportCategory, string]
  >;
  const errorCount = SUPPORT_ARTICLES.filter(
    (article) => article.category === "erros",
  ).length;

  return (
    <AppShell>
      <div className="page-wrap space-y-7">
        <section className="panel relative overflow-hidden p-6 sm:p-8 xl:p-10">
          <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-80 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)] xl:items-end">
            <div>
              <div className="eyebrow mb-3 flex items-center gap-2">
                <Bot className="h-3.5 w-3.5 text-primary" /> Atendimento
                inteligente
              </div>
              <h1 className="section-title text-4xl tracking-[-.045em] sm:text-6xl">
                Suporte que conhece
                <br />
                <span className="text-gradient-brand">toda a Zunexi.ai.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
                Tire dúvidas, descubra como usar cada recurso e receba uma
                solução guiada para erros. A IA consulta procedimentos reais do
                sistema e a base local continua disponível mesmo quando o
                provedor de IA estiver indisponível.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <HeroStat
                icon={<Clock3 className="h-4 w-4" />}
                value="24 horas"
                label="Disponível todos os dias"
              />
              <HeroStat
                icon={<BookOpen className="h-4 w-4" />}
                value={`${SUPPORT_ARTICLES.length} guias`}
                label="Funções documentadas"
              />
              <HeroStat
                icon={<AlertTriangle className="h-4 w-4" />}
                value={`${errorCount} soluções`}
                label="Erros mapeados"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-w-0 space-y-5">
            <div className="panel p-4 sm:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Busque uma função, mensagem de erro ou dúvida..."
                  className="app-input h-12 pl-11 pr-11"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Limpar busca"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                <CategoryButton
                  label="Todas"
                  active={category === "todas"}
                  onClick={() => setCategory("todas")}
                />
                {categories.map(([id, label]) => (
                  <CategoryButton
                    key={id}
                    label={label}
                    active={category === id}
                    onClick={() => setCategory(id)}
                  />
                ))}
              </div>
            </div>

            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="section-title text-xl">
                    Base de conhecimento
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {filtered.length}{" "}
                    {filtered.length === 1
                      ? "guia encontrado"
                      : "guias encontrados"}
                  </p>
                </div>
                {category !== "todas" && (
                  <button
                    type="button"
                    onClick={() => setCategory("todas")}
                    className="text-xs font-semibold text-primary hover:text-accent"
                  >
                    Ver tudo
                  </button>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="panel grid min-h-56 place-items-center border-dashed p-8 text-center">
                  <div>
                    <Search className="mx-auto h-7 w-7 text-primary" />
                    <h3 className="mt-3 font-semibold">
                      Nenhum guia encontrado
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pergunte ao chat ao lado usando suas próprias palavras.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filtered.map((article) => {
                    const Icon = CATEGORY_ICONS[article.category];
                    return (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => setSelected(article)}
                        className="panel group flex min-h-36 flex-col p-4 text-left hover:-translate-y-0.5 hover:border-primary/45 sm:p-5"
                      >
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground">
                              {SUPPORT_CATEGORY_LABELS[article.category]}
                            </span>
                            <h3 className="mt-1 text-sm font-semibold leading-5">
                              {article.title}
                            </h3>
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {article.summary}
                        </p>
                        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[11px] font-semibold text-primary">
                          Ver solução{" "}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0 2xl:sticky 2xl:top-[96px] 2xl:h-fit">
            <SupportChatPanel className="h-[min(760px,calc(100dvh-116px))]" />
          </aside>
        </section>

        <section className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Atendimento seguro</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                O suporte nunca solicita senha, chave completa, token ou segredo
                de integração. Quando uma correção exigir Vercel, Supabase ou
                Meta, a resposta identifica a etapa como exclusiva do
                administrador.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Chat sem consumo de
            créditos
          </span>
        </section>
      </div>

      {selected && (
        <ArticleModal article={selected} onClose={() => setSelected(null)} />
      )}
    </AppShell>
  );
}

function HeroStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-sm font-semibold text-foreground">{value}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function CategoryButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${active ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary/45 text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </button>
  );
}

function ArticleModal({
  article,
  onClose,
}: {
  article: SupportArticle;
  onClose: () => void;
}) {
  const Icon = CATEGORY_ICONS[article.category];
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={article.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-popover shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-popover/95 p-5 backdrop-blur-xl">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[.16em] text-primary">
              {SUPPORT_CATEGORY_LABELS[article.category]}
            </div>
            <h2 className="section-title mt-1 text-xl">{article.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Fechar guia"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5 sm:p-6">
          <p className="text-sm leading-6 text-muted-foreground">
            {article.summary}
          </p>
          <div className="mt-5 space-y-3">
            {article.steps.map((step, index) => (
              <div
                key={step}
                className="flex gap-3 rounded-xl border border-border bg-card/55 p-3.5"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <p className="pt-1 text-xs leading-5">{step}</p>
              </div>
            ))}
          </div>
          {article.important && (
            <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/8 p-4 text-xs leading-5 text-amber-800 dark:text-amber-100/85">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{article.important}</p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            {article.route && (
              <button
                type="button"
                onClick={() => window.location.assign(article.route!)}
                className="secondary-button"
              >
                <ArrowRight className="h-4 w-4" /> Abrir área relacionada
              </button>
            )}
            <button type="button" onClick={onClose} className="primary-button">
              Entendi
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
