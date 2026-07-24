import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  FolderOpen,
  ImagePlus,
  Images,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Search,
  Settings,
  X,
} from "lucide-react";
import { clearAccessKey, getAccessKey } from "@/lib/session";
import logoFull from "@/assets/logo-full.png";
import logoIcon from "@/assets/logo-icon.png";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/carrossel", label: "Criar carrossel", icon: Images },
  { to: "/cartaz", label: "Criar cartaz", icon: ImagePlus },
  { to: "/projetos", label: "Meus projetos", icon: FolderOpen },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/carrossel": "Criar carrossel",
  "/cartaz": "Criar cartaz",
  "/projetos": "Meus projetos",
  "/biblioteca": "Biblioteca",
  "/configuracoes": "Configurações",
};

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setAuthed(!!getAccessKey());
    setReady(true);
  }, [loc.pathname]);

  useEffect(() => setOpen(false), [loc.pathname]);

  const pageTitle = useMemo(() => {
    if (loc.pathname.startsWith("/editor/")) return "Editor visual";
    return PAGE_TITLES[loc.pathname] ?? "InLabs.Ia Studios";
  }, [loc.pathname]);

  if (!ready) return null;
  if (!authed) {
    if (typeof window !== "undefined" && loc.pathname !== "/acesso") {
      navigate({ to: "/acesso", replace: true });
    }
    return null;
  }

  const logout = () => {
    clearAccessKey();
    navigate({ to: "/acesso", replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-sidebar-border bg-sidebar/95 shadow-2xl backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-[76px] items-center border-b border-sidebar-border px-5">
          <img src={logoFull} alt="InLabs.Ia Studios" className="h-10 w-auto max-w-[185px] object-contain" />
        </div>

        <div className="px-4 pt-5">
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Estúdio
          </div>
          <nav className="space-y-1.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition hover:bg-white/[0.055] hover:text-white data-[status=active]:bg-gradient-to-r data-[status=active]:from-primary/25 data-[status=active]:to-accent/10 data-[status=active]:text-white data-[status=active]:shadow-[inset_3px_0_0_0_var(--color-primary)]"
              >
                <Icon className="h-[18px] w-[18px] text-muted-foreground transition group-hover:text-primary group-data-[status=active]:text-primary" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-white/[0.025] p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/25 bg-[#0d1020] p-1.5 shadow-[0_0_20px_rgba(139,92,246,0.16)]">
              <img src={logoIcon} alt="InLabs" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">Usuário InLabs</div>
              <div className="truncate text-[11px] text-muted-foreground">Acesso autorizado</div>
            </div>
            <button onClick={logout} title="Sair" className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {open && <button aria-label="Fechar menu" className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[76px] items-center gap-3 border-b border-border/80 bg-background/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button onClick={() => setOpen(true)} className="rounded-xl border border-border bg-card p-2.5 lg:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">InLabs.Ia Studios</p>
            <h2 className="truncate text-base font-semibold">{pageTitle}</h2>
          </div>
          <div className="ml-auto hidden w-full max-w-sm items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5 md:flex">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input aria-label="Buscar" placeholder="Buscar projetos e conteúdos..." className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
          </div>
          <button className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:text-white">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          <button className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 sm:flex">
            <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg border border-primary/25 bg-[#0d1020] p-1">
              <img src={logoIcon} alt="InLabs" className="h-full w-full object-contain" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold">Usuário InLabs</div>
              <div className="text-[10px] text-muted-foreground">Conta autorizada</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </header>

        <main className="min-h-[calc(100vh-76px)]">{children}</main>
      </div>
    </div>
  );
}
