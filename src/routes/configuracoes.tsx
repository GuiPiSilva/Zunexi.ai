import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, KeyRound, LogOut, Monitor, Palette, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { clearAccessKey, getAccessKey, getAccessUserName } from "@/lib/session";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Zunexi.ai" }] }),
  component: Configuracoes,
});

type Theme = "escuro" | "sistema";

function Configuracoes() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<Theme>("escuro");
  const [notifications, setNotifications] = useState(true);
  const [accessKey, setAccessKeyState] = useState("");

  useEffect(() => {
    setName(getAccessUserName());
    setTheme((localStorage.getItem("inlabs.theme") as Theme) || "escuro");
    setNotifications(localStorage.getItem("inlabs.notifications") !== "false");
    setAccessKeyState(getAccessKey() || "");
  }, []);

  const maskedKey = useMemo(() => {
    if (!accessKey) return "Nenhuma chave ativa";
    const parts = accessKey.split("-");
    if (parts.length < 4) return "••••••••••••";
    return `${parts[0]}-${parts[1]}-••••-${parts[3]}`;
  }, [accessKey]);

  function saveSettings() {
    localStorage.setItem("inlabs.theme", theme);
    localStorage.setItem("inlabs.notifications", String(notifications));
    toast.success("Preferências salvas.");
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
          <p className="mt-2 text-sm text-muted-foreground">Gerencie informações locais, aparência e sessão de acesso.</p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
          <aside className="panel h-fit p-3">
            <SettingNav icon={UserRound} label="Perfil" active />
            <SettingNav icon={Palette} label="Preferências" />
            <SettingNav icon={ShieldCheck} label="Segurança" />
            <SettingNav icon={Bell} label="Notificações" />
          </aside>

          <div className="space-y-6">
            <section className="panel p-5 sm:p-6">
              <div className="mb-6 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-brand text-sm font-bold text-white">IN</div>
                <div>
                  <h2 className="section-title text-xl">Informações do perfil</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Esses dados ficam salvos apenas neste dispositivo.</p>
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-medium">Nome de exibição</span>
                  <input value={name} readOnly className="app-input cursor-not-allowed opacity-80" />
                  <span className="mt-2 block text-xs text-muted-foreground">Nome definido pelo administrador ao criar sua chave de acesso.</span>
                </label>
                <div><span className="mb-2 block text-sm font-medium">Tipo de acesso</span><div className="app-input flex items-center gap-2 text-muted-foreground"><KeyRound className="h-4 w-4 text-primary" /> Chave liberada pelo administrador</div></div>
                <div><span className="mb-2 block text-sm font-medium">Status</span><div className="app-input flex items-center gap-2 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Acesso ativo</div></div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="panel p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Monitor className="h-5 w-5" /></div><div><h2 className="font-semibold">Aparência</h2><p className="text-xs text-muted-foreground">Defina como o sistema será exibido.</p></div></div>
                <label className="block"><span className="mb-2 block text-sm font-medium">Tema da interface</span><select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} className="app-input"><option value="escuro">Escuro</option><option value="sistema">Usar preferência do sistema</option></select></label>
                <label className="mt-4 flex items-center justify-between rounded-xl border border-border bg-white/[0.02] p-4"><div><div className="text-sm font-medium">Notificações</div><div className="mt-1 text-xs text-muted-foreground">Avisos sobre gerações e salvamentos.</div></div><input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} className="h-5 w-5 accent-purple-500" /></label>
              </div>

              <div className="panel p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-semibold">Segurança da sessão</h2><p className="text-xs text-muted-foreground">Sua chave não pode ser criada ou alterada nesta tela.</p></div></div>
                <div className="rounded-xl border border-border bg-[#0a0e1a] p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Chave atual</div>
                  <div className="mt-2 font-mono text-sm tracking-wider">{maskedKey}</div>
                </div>
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/8 p-4 text-xs leading-relaxed text-amber-100/80">
                  Novas chaves são criadas exclusivamente pelo administrador. Para trocar o acesso, encerre a sessão e use uma chave fornecida por ele.
                </div>
                <button onClick={logout} className="secondary-button mt-4 w-full"><LogOut className="h-4 w-4" /> Encerrar sessão</button>
              </div>
            </section>

            <div className="flex justify-end"><button onClick={saveSettings} className="primary-button"><Save className="h-4 w-4" /> Salvar alterações</button></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SettingNav({ icon: Icon, label, active = false }: { icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean }) {
  return <button className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${active ? "bg-gradient-to-r from-primary/25 to-accent/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"}`}><Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />{label}</button>;
}
