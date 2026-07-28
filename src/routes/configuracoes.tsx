import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, KeyRound, LogOut, Monitor, Moon, Palette, Save, ShieldCheck, Sun, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { requestNotificationPermission } from "@/lib/notifications";
import { clearAccessKey, getAccessKey, getAccessUserName, setAccessUserName } from "@/lib/session";
import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";
import logoIcon from "@/assets/logo-icon.png";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Zunexi.ai" }] }),
  component: Configuracoes,
});

type SettingsTab = "perfil" | "preferencias" | "seguranca" | "notificacoes";
type NotificationPermissionState = NotificationPermission | "unsupported";

const NOTIFICATIONS_ENABLED_KEY = "zunexi.notifications.enabled";

function Configuracoes() {
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>("perfil");
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("escuro");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermissionState>("unsupported");
  const [accessKey, setAccessKeyState] = useState("");

  useEffect(() => {
    setName(getAccessUserName());
    setTheme(getThemePreference());
    setNotificationsEnabled(localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== "false");
    setAccessKeyState(getAccessKey() || "");
    setBrowserPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const maskedKey = useMemo(() => {
    if (!accessKey) return "Nenhuma chave ativa";
    const parts = accessKey.split("-");
    if (parts.length < 4) return `${accessKey.slice(0, 4)}••••••••`;
    return `${parts[0]}-${parts[1]}-••••-${parts[3]}`;
  }, [accessKey]);

  function saveSettings() {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      toast.error("Digite um nome de exibição com pelo menos 2 caracteres.");
      setActiveTab("perfil");
      return;
    }
    if (normalizedName.length > 60) {
      toast.error("O nome de exibição pode ter no máximo 60 caracteres.");
      setActiveTab("perfil");
      return;
    }

    setAccessUserName(normalizedName);
    setName(normalizedName);
    setThemePreference(theme);
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(notificationsEnabled));
    toast.success("Alterações salvas.");
  }

  async function enableBrowserNotifications() {
    const permission = await requestNotificationPermission();
    setBrowserPermission(permission);
    if (permission === "granted") {
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "true");
      toast.success("Notificações do navegador ativadas.");
    } else if (permission === "denied") {
      toast.error("O navegador bloqueou as notificações. Você pode liberar a permissão nas configurações do navegador.");
    } else if (permission === "unsupported") {
      toast.error("Este navegador não oferece notificações para esta página.");
    }
  }

  function changeTheme(nextTheme: ThemePreference) {
    setTheme(nextTheme);
    setThemePreference(nextTheme);
  }

  function logout() {
    clearAccessKey();
    nav({ to: "/acesso", replace: true });
  }

  return (
    <AppShell>
      <div className="page-wrap space-y-7">
        <section>
          <div className="eyebrow mb-2 flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Conta e preferências</div>
          <h1 className="section-title text-3xl sm:text-4xl">Configurações</h1>
          <p className="mt-2 text-sm text-muted-foreground">Gerencie seu perfil, preferências, notificações e sessão de acesso.</p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
          <aside className="panel h-fit p-3">
            <SettingNav icon={UserRound} label="Perfil" active={activeTab === "perfil"} onClick={() => setActiveTab("perfil")} />
            <SettingNav icon={Palette} label="Preferências" active={activeTab === "preferencias"} onClick={() => setActiveTab("preferencias")} />
            <SettingNav icon={ShieldCheck} label="Segurança" active={activeTab === "seguranca"} onClick={() => setActiveTab("seguranca")} />
            <SettingNav icon={Bell} label="Notificações" active={activeTab === "notificacoes"} onClick={() => setActiveTab("notificacoes")} />
          </aside>

          <div className="space-y-6">
            {activeTab === "perfil" && (
              <section className="panel p-5 sm:p-6">
                <div className="mb-6 flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-primary/25 bg-black p-2 shadow-[0_0_24px_rgba(139,92,246,0.15)]">
                    <img src={logoIcon} alt="Zunexi.ai" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <h2 className="section-title text-xl">Informações do perfil</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Você pode alterar o nome exibido na sua conta quando quiser.</p>
                  </div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-medium">Nome de exibição</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={60}
                      placeholder="Seu nome"
                      className="app-input"
                    />
                    <span className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>Esse nome aparece no topo e no menu lateral da sua conta.</span>
                      <span>{name.trim().length}/60</span>
                    </span>
                  </label>
                  <div><span className="mb-2 block text-sm font-medium">Tipo de acesso</span><div className="app-input flex items-center gap-2 text-muted-foreground"><KeyRound className="h-4 w-4 text-primary" /> Chave liberada pelo administrador</div></div>
                  <div><span className="mb-2 block text-sm font-medium">Status</span><div className="app-input flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Acesso ativo</div></div>
                </div>
              </section>
            )}

            {activeTab === "preferencias" && (
              <section className="panel p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary"><Monitor className="h-5 w-5" /></div>
                  <div><h2 className="section-title text-xl">Preferências</h2><p className="mt-1 text-xs text-muted-foreground">Personalize o comportamento visual da sua conta.</p></div>
                </div>
                <div>
                  <span className="mb-3 block text-sm font-medium">Tema da interface</span>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ThemeOption
                      icon={Sun}
                      title="Claro"
                      description="Interface clara e limpa."
                      selected={theme === "claro"}
                      onClick={() => changeTheme("claro")}
                    />
                    <ThemeOption
                      icon={Moon}
                      title="Escuro"
                      description="Visual premium original."
                      selected={theme === "escuro"}
                      onClick={() => changeTheme("escuro")}
                    />
                    <ThemeOption
                      icon={Monitor}
                      title="Sistema"
                      description="Segue o tema do dispositivo."
                      selected={theme === "sistema"}
                      onClick={() => changeTheme("sistema")}
                    />
                  </div>
                  <span className="mt-3 block text-xs text-muted-foreground">A mudança é aplicada na hora e fica salva neste dispositivo.</span>
                </div>
              </section>
            )}

            {activeTab === "seguranca" && (
              <section className="panel p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary"><ShieldCheck className="h-5 w-5" /></div>
                  <div><h2 className="section-title text-xl">Segurança da sessão</h2><p className="mt-1 text-xs text-muted-foreground">Consulte seu acesso atual ou encerre a sessão neste dispositivo.</p></div>
                </div>
                <div className="rounded-xl border border-border bg-secondary/45 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Chave atual</div>
                  <div className="mt-2 font-mono text-sm tracking-wider">{maskedKey}</div>
                </div>
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/8 p-4 text-xs leading-relaxed text-amber-700 dark:text-amber-100/80">
                  Novas chaves continuam sendo criadas exclusivamente pelo administrador. Para trocar de acesso, encerre a sessão e entre com outra chave autorizada.
                </div>
                <button onClick={logout} className="secondary-button mt-4 w-full"><LogOut className="h-4 w-4" /> Encerrar sessão</button>
              </section>
            )}

            {activeTab === "notificacoes" && (
              <section className="panel p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary"><Bell className="h-5 w-5" /></div>
                  <div><h2 className="section-title text-xl">Notificações</h2><p className="mt-1 text-xs text-muted-foreground">Controle os avisos de conclusões, erros e salvamentos.</p></div>
                </div>

                <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/55 p-4">
                  <div><div className="text-sm font-medium">Notificações do navegador</div><div className="mt-1 text-xs text-muted-foreground">Receba um aviso quando uma criação terminar, mesmo estando em outra aba.</div></div>
                  <input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} className="h-5 w-5 shrink-0 accent-purple-500" />
                </label>

                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-secondary/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium">Permissão do navegador</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {browserPermission === "granted" && "Permitida neste navegador."}
                      {browserPermission === "denied" && "Bloqueada neste navegador."}
                      {browserPermission === "default" && "Ainda não solicitada."}
                      {browserPermission === "unsupported" && "Não disponível neste navegador."}
                    </div>
                  </div>
                  {browserPermission !== "granted" && browserPermission !== "unsupported" && (
                    <button type="button" onClick={enableBrowserNotifications} className="secondary-button shrink-0"><BellRing className="h-4 w-4" /> Ativar permissão</button>
                  )}
                </div>
              </section>
            )}

            <div className="flex justify-end">
              <button onClick={saveSettings} className="primary-button"><Save className="h-4 w-4" /> Salvar alterações</button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SettingNav({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${active ? "bg-gradient-to-r from-primary/25 to-accent/10 text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"}`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
      {label}
    </button>
  );
}

function ThemeOption({ icon: Icon, title, description, selected, onClick }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group rounded-2xl border p-4 text-left transition ${selected ? "border-primary bg-primary/10 shadow-[0_12px_35px_rgba(109,75,255,0.10)]" : "border-border bg-card/50 hover:border-primary/35 hover:bg-secondary/60"}`}
    >
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground group-hover:text-foreground"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
      <div className={`mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] ${selected ? "text-primary" : "text-muted-foreground/70"}`}>
        {selected ? "Selecionado" : "Selecionar"}
      </div>
    </button>
  );
}
