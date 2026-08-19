import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BellRing,
  BriefcaseBusiness,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Coins,
  FolderOpen,
  ImagePlus,
  Images,
  Inbox,
  LayoutDashboard,
  Library,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquareText,
  Palette,
  Search,
  Send,
  Settings,
  Trash2,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { getAccessCreditStatus, type CreditStatus } from "@/lib/access.functions";
import { clearAccessKey, getAccessKey, getAccessUserName } from "@/lib/session";
import {
  clearNotifications,
  loadNotifications,
  markAllNotificationsRead,
  requestNotificationPermission,
  subscribeNotifications,
  type InLabsNotification,
} from "@/lib/notifications";
import { hydrateCloudWorkspace, loadProjects } from "@/lib/storage";
import type { PlanFeature } from "@/lib/plans";
import logoFull from "@/assets/logo-full.png";
import logoIcon from "@/assets/logo-icon.png";

type AppRoute = "/" | "/agencia" | "/publicacoes" | "/redes" | "/caixa-entrada" | "/analytics" | "/automacoes" | "/equipe" | "/carrossel" | "/cartaz" | "/criador-prompts" | "/agenda" | "/brand-kit" | "/projetos" | "/biblioteca" | "/configuracoes";

type NavigationItem = {
  to: AppRoute;
  label: string;
  icon: ComponentType<{ className?: string }>;
  feature?: PlanFeature;
  group: "Operação" | "Criação" | "Workspace";
  keywords?: string;
};

const NAV: NavigationItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Operação", keywords: "inicio painel resumo" },
  { to: "/agencia", label: "Agência 360", icon: BriefcaseBusiness, group: "Operação", keywords: "marketing estrategia seo crm growth trafego branding agencia" },
  { to: "/publicacoes", label: "Publicações", icon: Send, feature: "publicacoes", group: "Operação", keywords: "post publicar aprovação" },
  { to: "/agenda", label: "Calendário", icon: CalendarDays, feature: "agenda", group: "Operação", keywords: "agenda agendar planejamento" },
  { to: "/redes", label: "Redes conectadas", icon: MessageSquareText, feature: "gestao_redes", group: "Operação", keywords: "instagram facebook tiktok linkedin meta" },
  { to: "/caixa-entrada", label: "Caixa de entrada", icon: Inbox, feature: "caixa_entrada", group: "Operação", keywords: "mensagens comentários atendimento" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, feature: "analytics", group: "Operação", keywords: "metricas desempenho dados kpi" },
  { to: "/automacoes", label: "Automações", icon: Workflow, feature: "automacoes", group: "Operação", keywords: "fluxos regras gatilhos" },
  { to: "/equipe", label: "Equipe", icon: UsersRound, feature: "equipe", group: "Operação", keywords: "membros permissões" },
  { to: "/carrossel", label: "Criar carrossel", icon: Images, group: "Criação", keywords: "conteudo post slides ia" },
  { to: "/cartaz", label: "Criar cartaz", icon: ImagePlus, group: "Criação", keywords: "arte imagem campanha" },
  { to: "/criador-prompts", label: "Criador de prompts", icon: MessageSquareText, feature: "criador_prompts", group: "Criação", keywords: "prompt briefing ideias ia" },
  { to: "/brand-kit", label: "Brand Kit", icon: Palette, feature: "brand_kit", group: "Workspace", keywords: "marca logo cores tipografia pdf" },
  { to: "/projetos", label: "Meus projetos", icon: FolderOpen, group: "Workspace", keywords: "arquivos artes projetos" },
  { to: "/biblioteca", label: "Biblioteca", icon: Library, group: "Workspace", keywords: "imagens midia arquivos" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, group: "Workspace", keywords: "conta preferencias perfil" },
];

const PAGE_TITLES: Record<string, string> = Object.fromEntries(NAV.map((item) => [item.to, item.label]));

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const getCredits = useServerFn(getAccessCreditStatus);
  const notificationBox = useRef<HTMLDivElement | null>(null);
  const profileBox = useRef<HTMLDivElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const syncedAccessKey = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [userName, setUserName] = useState("Usuário Zunexi.ai");
  const [open, setOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<InLabsNotification[]>([]);
  const [credits, setCredits] = useState<CreditStatus | null>(null);

  async function refreshCredits() {
    const key = getAccessKey();
    if (!key) return;
    try { setCredits(await getCredits({ data: { key } })); }
    catch { setCredits(null); }
  }

  useEffect(() => {
    const key = getAccessKey();
    setAuthed(!!key);
    setUserName(getAccessUserName());
    setNotifications(loadNotifications());
    setReady(true);
    if (key) {
      void refreshCredits();
      if (syncedAccessKey.current !== key) {
        syncedAccessKey.current = key;
        void hydrateCloudWorkspace().catch((error) => {
          syncedAccessKey.current = null;
          console.warn("Sincronização inicial indisponível:", error);
        });
      }
    }
  }, [loc.pathname]);

  useEffect(() => {
    setOpen(false);
    setProfileOpen(false);
  }, [loc.pathname]);

  useEffect(() => subscribeNotifications(() => setNotifications(loadNotifications())), []);

  useEffect(() => {
    const updateCredits = () => void refreshCredits();
    window.addEventListener("inlabs:credits-changed", updateCredits);
    return () => window.removeEventListener("inlabs:credits-changed", updateCredits);
  }, []);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (notificationBox.current && !notificationBox.current.contains(target)) setNotificationOpen(false);
      if (profileBox.current && !profileBox.current.contains(target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInput.current?.focus(), 20);
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    const refreshUserName = () => setUserName(getAccessUserName());
    window.addEventListener("zunexi:profile-updated", refreshUserName);
    window.addEventListener("storage", refreshUserName);
    return () => {
      window.removeEventListener("zunexi:profile-updated", refreshUserName);
      window.removeEventListener("storage", refreshUserName);
    };
  }, []);

  const pageTitle = useMemo(() => loc.pathname.startsWith("/editor/") ? "Arte pronta" : PAGE_TITLES[loc.pathname] ?? "Zunexi.ai", [loc.pathname]);
  const unread = notifications.filter((item) => !item.read).length;

  const searchResults = useMemo(() => {
    const value = searchQuery.trim().toLowerCase();
    const routes = NAV.filter((item) => !value || `${item.label} ${item.keywords || ""}`.toLowerCase().includes(value)).slice(0, 8);
    const projects = loadProjects().filter((item) => !value || item.name.toLowerCase().includes(value)).slice(0, 6);
    return { routes, projects };
  }, [searchQuery, searchOpen]);

  if (!ready) return null;
  if (!authed) {
    if (typeof window !== "undefined" && loc.pathname !== "/acesso") navigate({ to: "/acesso", replace: true });
    return null;
  }

  const logout = () => {
    clearAccessKey();
    navigate({ to: "/acesso", replace: true });
  };

  function openNotification(item: InLabsNotification) {
    markAllNotificationsRead();
    setNotifications(loadNotifications());
    setNotificationOpen(false);
    if (item.href) window.location.assign(item.href);
  }

  function openSearch() {
    setSearchOpen(true);
    setNotificationOpen(false);
    setProfileOpen(false);
    setTimeout(() => searchInput.current?.focus(), 20);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
  }

  return (
    <div className="app-shell min-h-screen bg-background text-foreground lg:flex">
      <div className="app-ambient" aria-hidden="true"><i /><i /><i /></div>
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-50 flex w-[276px] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar/95 shadow-2xl backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-[244px] xl:w-[260px] 2xl:w-[276px] ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="app-sidebar-brand flex h-[76px] shrink-0 items-center border-b border-sidebar-border px-4">
          <img src={logoFull} alt="Zunexi.ai" className="brand-logo-full h-14 w-auto max-w-[220px] object-contain" />
        </div>

        <div className="app-sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-4">
          {(["Operação", "Criação", "Workspace"] as const).map((group) => (
            <div key={group} className="mb-5">
              <div className="app-sidebar-label mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{group}</div>
              <nav className="space-y-1">
                {NAV.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon;
                  const locked = Boolean(item.feature && credits && !credits.features.includes(item.feature));
                  return (
                    <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} className="app-sidebar-link group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition hover:bg-secondary/70 hover:text-foreground data-[status=active]:bg-gradient-to-r data-[status=active]:from-primary/25 data-[status=active]:to-accent/10 data-[status=active]:text-foreground data-[status=active]:shadow-[inset_3px_0_0_0_var(--color-primary)]">
                      <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground transition group-hover:text-primary group-data-[status=active]:text-primary" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.to === "/agencia" && <span className="rounded-full bg-primary/14 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary">360</span>}
                      {locked && <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground/70" />}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="app-sidebar-footer shrink-0 border-t border-sidebar-border/70 p-3">
          <div className="app-sidebar-credits mb-2 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5 text-xs">
            <Coins className="h-4 w-4 text-primary" />
            <div className="min-w-0"><div className="font-semibold">{credits?.unlimited ? "Créditos infinitos" : `${credits?.remaining ?? "—"} créditos no mês`}</div><div className="mt-0.5 text-[10px] uppercase tracking-[.14em] text-muted-foreground">Plano {credits?.planName || "—"}</div></div>
          </div>
          <div className="app-sidebar-profile flex items-center gap-3 rounded-xl border border-sidebar-border bg-card/55 p-2.5">
            <div className="brand-logo-tile grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/25 p-1.5"><img src={logoIcon} alt="Zunexi.ai" className="brand-logo-icon h-full w-full object-contain" /></div>
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold" title={userName}>{userName}</div><div className="truncate text-[10px] text-muted-foreground">Plano {credits?.planName || "carregando"}</div></div>
            <button onClick={logout} title="Sair" className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      {open && <button aria-label="Fechar menu" className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="app-main min-w-0 flex-1">
        <header className="app-topbar sticky top-0 z-30 flex h-[76px] items-center gap-3 border-b border-border/80 bg-background/75 px-4 backdrop-blur-2xl sm:px-6 lg:px-8">
          <button onClick={() => setOpen(true)} className="rounded-xl border border-border bg-card p-2.5 lg:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Zunexi.ai</p><h2 className="truncate text-base font-semibold">{pageTitle}</h2></div>
          <button onClick={openSearch} className="app-topbar-search ml-auto hidden min-w-0 w-full max-w-md items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5 text-left min-[1050px]:flex"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Buscar projetos, ferramentas e conteúdos...</span><kbd className="shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Ctrl K</kbd></button>
          <button onClick={openSearch} className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:text-foreground min-[1050px]:hidden" aria-label="Buscar"><Search className="h-4 w-4" /></button>

          <div ref={notificationBox} className="relative">
            <button onClick={() => { setNotificationOpen((value) => !value); if (!notificationOpen) { markAllNotificationsRead(); setNotifications(loadNotifications()); } }} className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:text-foreground" aria-label="Notificações">
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </button>
            {notificationOpen && <div className="absolute right-0 top-12 z-50 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"><div className="flex items-center justify-between border-b border-border px-4 py-3"><div><div className="font-semibold">Notificações</div><div className="text-[11px] text-muted-foreground">Atividade da sua operação</div></div><div className="flex gap-1"><button onClick={async () => { const permission = await requestNotificationPermission(); if (permission === "granted") setNotificationOpen(false); }} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary/70 hover:text-foreground" title="Ativar notificações"><BellRing className="h-4 w-4" /></button><button onClick={() => { markAllNotificationsRead(); setNotifications(loadNotifications()); }} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary/70 hover:text-foreground" title="Marcar como lidas"><CheckCheck className="h-4 w-4" /></button><button onClick={() => { clearNotifications(); setNotifications([]); }} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary/70 hover:text-foreground" title="Limpar"><Trash2 className="h-4 w-4" /></button></div></div><div className="max-h-[420px] overflow-y-auto">{notifications.length === 0 ? <div className="grid min-h-36 place-items-center px-6 text-center text-sm text-muted-foreground">Nenhuma notificação no momento.</div> : notifications.map((item) => <button key={item.id} onClick={() => openNotification(item)} className="block w-full border-b border-border/70 px-4 py-3 text-left transition hover:bg-secondary/60"><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.kind === "error" ? "bg-red-400" : item.kind === "success" ? "bg-emerald-400" : "bg-primary"}`} /><div className="min-w-0"><div className="text-sm font-semibold">{item.title}</div><div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.message}</div><div className="mt-1.5 text-[10px] text-muted-foreground">{formatNotificationDate(item.createdAt)}</div></div></div></button>)}</div></div>}
          </div>

          <div ref={profileBox} className="relative hidden sm:block">
            <button type="button" onClick={() => { setProfileOpen((value) => !value); setNotificationOpen(false); }} className="app-profile-button flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 hover:border-primary/35 hover:bg-secondary/60 xl:px-3">
              <div className="brand-logo-tile grid h-8 w-8 place-items-center overflow-hidden rounded-lg border border-primary/25 p-1"><img src={logoIcon} alt="Zunexi.ai" className="brand-logo-icon h-full w-full object-contain" /></div>
              <div className="hidden text-left xl:block"><div className="max-w-[130px] truncate text-xs font-semibold" title={userName}>{userName}</div><div className="text-[10px] text-muted-foreground">{credits?.planName || "Plano"} · {credits?.unlimited ? "∞" : `${credits?.remaining ?? "—"} créditos`}</div></div>
              <ChevronDown className={`hidden h-3.5 w-3.5 text-muted-foreground transition-transform xl:block ${profileOpen ? "rotate-180" : ""}`} />
            </button>
            {profileOpen && <div role="menu" className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-border bg-popover p-2 shadow-2xl"><div className="border-b border-border px-3 py-2.5"><div className="truncate text-sm font-semibold" title={userName}>{userName}</div><div className="mt-0.5 text-[11px] text-muted-foreground">Plano {credits?.planName || "—"}</div></div><button onClick={() => { setProfileOpen(false); navigate({ to: "/configuracoes" }); }} className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-secondary/70 hover:text-foreground"><Settings className="h-4 w-4 text-primary" /> Configurações</button><button onClick={logout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10"><LogOut className="h-4 w-4" /> Sair da conta</button></div>}
          </div>
        </header>
        <main className="min-h-[calc(100vh-76px)]">{children}</main>
      </div>

      {searchOpen && <div className="fixed inset-0 z-[100] bg-black/65 p-4 pt-[10vh] backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSearch(); }}><div className="mx-auto w-full max-w-2xl overflow-hidden rounded-[1.4rem] border border-border bg-popover shadow-2xl"><div className="flex items-center gap-3 border-b border-border px-4 py-3"><Search className="h-5 w-5 text-primary" /><input ref={searchInput} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Digite para buscar..." className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none" /><button onClick={closeSearch} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button></div><div className="max-h-[65vh] overflow-y-auto p-2">{searchResults.routes.length > 0 && <div><div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Ferramentas</div>{searchResults.routes.map((item) => { const Icon = item.icon; return <button key={item.to} onClick={() => { closeSearch(); navigate({ to: item.to as any }); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-secondary/70"><div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div><div className="text-sm font-semibold">{item.label}</div><div className="text-[10px] text-muted-foreground">{item.group}</div></div></button>; })}</div>}{searchResults.projects.length > 0 && <div className="mt-2 border-t border-border pt-2"><div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Projetos</div>{searchResults.projects.map((project) => <button key={project.id} onClick={() => { closeSearch(); navigate({ to: "/editor/$id", params: { id: project.id } }); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-secondary/70"><div className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-muted-foreground"><FolderOpen className="h-4 w-4" /></div><div className="min-w-0"><div className="truncate text-sm font-semibold">{project.name}</div><div className="text-[10px] capitalize text-muted-foreground">{project.type}</div></div></button>)}</div>}{searchResults.routes.length === 0 && searchResults.projects.length === 0 && <div className="grid min-h-40 place-items-center px-8 text-center text-sm text-muted-foreground">Nenhum resultado para “{searchQuery}”.</div>}</div></div></div>}
    </div>
  );
}

function formatNotificationDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
