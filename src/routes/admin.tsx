import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Coins,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Plus,
  Power,
  Search,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import logoFull from "@/assets/logo-full.png";
import {
  adminCreateKey,
  adminDeleteKey,
  adminListKeys,
  adminLogin,
  adminToggleKey,
  adminUpdateCredits,
} from "@/lib/access.functions";
import { clearAdminToken, getAdminToken, setAdminToken } from "@/lib/session";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Zunexi.ai" },
      { name: "description", content: "Painel restrito para administração de chaves de acesso." },
    ],
  }),
  component: Admin,
});

type Row = {
  id: string;
  key: string;
  label: string | null;
  active: boolean;
  uses: number;
  last_used_at: string | null;
  created_at: string;
  credits_per_day: number;
  unlimited_credits: boolean;
  credits_used_today: number;
  credits_reset_date: string;
};

function Admin() {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getAdminToken());
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  return token ? (
    <Panel token={token} onLogout={() => { clearAdminToken(); setToken(null); }} />
  ) : (
    <Login onOk={(newToken) => { setAdminToken(newToken); setToken(newToken); }} />
  );
}

function Login({ onOk }: { onOk: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useServerFn(adminLogin);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await login({ data: { password } });
      onOk(result.token);
      toast.success("Sessão administrativa iniciada.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#050711] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(650px_circle_at_20%_30%,rgba(124,58,237,.22),transparent_58%),radial-gradient(750px_circle_at_80%_70%,rgba(37,99,235,.14),transparent_60%)]" />
      <form onSubmit={submit} className="panel relative w-full max-w-md border-primary/20 p-7 sm:p-9">
        <div className="mb-7 flex justify-center"><img src={logoFull} alt="Zunexi.ai" className="h-12 w-auto max-w-[250px] object-contain" /></div>
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><ShieldCheck className="h-7 w-7" /></div>
          <h1 className="section-title text-2xl">Área do administrador</h1>
          <p className="mt-2 text-sm text-muted-foreground">Somente o administrador pode criar, bloquear ou excluir chaves de acesso.</p>
        </div>
        <label className="mt-7 block">
          <span className="mb-2 block text-sm font-medium">Senha administrativa</span>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-[#0a0e1a] px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
            <LockKeyhole className="h-5 w-5 text-primary" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="h-14 w-full bg-transparent outline-none" />
          </div>
        </label>
        <button disabled={busy} className="primary-button mt-5 h-13 w-full disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar no painel
        </button>
        <p className="mt-5 text-center text-xs text-muted-foreground">Esta rota não aparece no menu dos usuários.</p>
      </form>
    </main>
  );
}

function Panel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const list = useServerFn(adminListKeys);
  const create = useServerFn(adminCreateKey);
  const toggle = useServerFn(adminToggleKey);
  const updateCredits = useServerFn(adminUpdateCredits);
  const remove = useServerFn(adminDeleteKey);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [creditsPerDay, setCreditsPerDay] = useState(30);
  const [unlimited, setUnlimited] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setRows((await list({ data: { token } })) as Row[]);
    } catch (error) {
      toast.error((error as Error).message);
      if (/sessão|expirada|inválida/i.test((error as Error).message)) onLogout();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) => row.key.toLowerCase().includes(value) || row.label?.toLowerCase().includes(value));
  }, [query, rows]);

  const activeCount = rows.filter((row) => row.active).length;
  const blockedCount = rows.length - activeCount;
  const useCount = rows.reduce((sum, row) => sum + row.uses, 0);

  async function doCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    if (label.trim().length < 2) {
      toast.error("Informe o nome do cliente ou responsável.");
      return;
    }
    setCreating(true);
    try {
      const row = await create({ data: { token, label: label.trim(), creditsPerDay, unlimited } });
      setRows((current) => [row as Row, ...current]);
      setLabel("");
      setCreditsPerDay(30);
      setUnlimited(false);
      toast.success("Chave criada pelo administrador.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function doSaveCredits(row: Row, nextCredits: number, nextUnlimited: boolean) {
    try {
      const updated = await updateCredits({ data: { token, id: row.id, creditsPerDay: nextCredits, unlimited: nextUnlimited } });
      setRows((current) => current.map((item) => item.id === row.id ? updated as Row : item));
      toast.success(nextUnlimited ? "Créditos infinitos ativados." : "Limite diário atualizado.");
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }

  async function doToggle(row: Row) {
    try {
      await toggle({ data: { token, id: row.id, active: !row.active } });
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, active: !item.active } : item));
      toast.success(row.active ? "Chave bloqueada." : "Chave reativada.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function doDelete(row: Row) {
    if (!confirm(`Excluir definitivamente a chave de ${row.label || row.key}?`)) return;
    try {
      await remove({ data: { token, id: row.id } });
      setRows((current) => current.filter((item) => item.id !== row.id));
      toast.success("Chave excluída.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1500px] items-center gap-4 px-5 lg:px-8">
          <img src={logoFull} alt="Zunexi.ai" className="h-10 w-auto max-w-[190px] object-contain" />
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">ADMIN</span>
          <button onClick={onLogout} className="secondary-button ml-auto"><LogOut className="h-4 w-4" /> Encerrar sessão</button>
        </div>
      </header>

      <div className="page-wrap space-y-7">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow mb-2 flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Controle restrito</div>
            <h1 className="section-title text-3xl sm:text-4xl">Chaves de acesso</h1>
            <p className="mt-2 text-sm text-muted-foreground">Gerencie os acessos ao sistema. Usuários comuns não têm permissão para criar chaves ou contas.</p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetric icon={KeyRound} value={rows.length} label="Total de chaves" />
          <AdminMetric icon={Check} value={activeCount} label="Ativas" tone="success" />
          <AdminMetric icon={Power} value={blockedCount} label="Bloqueadas" tone="warning" />
          <AdminMetric icon={ShieldCheck} value={useCount} label="Acessos registrados" />
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="section-title text-lg">Criar nova chave</h2>
            <p className="mt-1 text-xs text-muted-foreground">Esta ação é exclusiva do administrador. Identifique claramente o responsável pela chave.</p>
          </div>
          <form onSubmit={doCreate} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_190px_auto] lg:items-center">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome do cliente, equipe ou responsável" className="app-input" />
            <label className="relative">
              <Coins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="number" min={0} max={1000000} disabled={unlimited} value={creditsPerDay} onChange={(e) => setCreditsPerDay(Math.max(0, Number(e.target.value) || 0))} className="app-input pl-10 disabled:opacity-45" aria-label="Créditos por dia" />
            </label>
            <label className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-[#0a0e1a] px-4 text-sm">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="h-4 w-4 accent-violet-500" />
              Créditos infinitos
            </label>
            <button disabled={creating} className="primary-button shrink-0 disabled:opacity-60">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Gerar chave
            </button>
          </form>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="font-semibold">Acessos cadastrados</h2>
              <p className="mt-1 text-xs text-muted-foreground">Copie, bloqueie ou exclua chaves existentes.</p>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-[#0a0e1a] px-3 py-2.5 sm:w-80">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar chave ou responsável..." className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>

          {loading ? (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground"><span><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando chaves...</span></div>
          ) : filtered.length === 0 ? (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">Nenhuma chave encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-white/[0.025] text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4">Chave</th>
                    <th className="px-5 py-4">Responsável</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Acessos</th>
                    <th className="px-5 py-4">Créditos diários</th>
                    <th className="px-5 py-4">Criada em</th>
                    <th className="px-5 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-t border-border/75 hover:bg-white/[0.018]">
                      <td className="px-5 py-4"><div className="flex items-center gap-2 font-mono text-xs"><KeyRound className="h-3.5 w-3.5 text-primary" />{row.key}<CopyInline text={row.key} /></div></td>
                      <td className="px-5 py-4"><div className="font-medium">{row.label || "Sem identificação"}</div><div className="mt-0.5 text-[11px] text-muted-foreground">Último uso: {row.last_used_at ? new Date(row.last_used_at).toLocaleString("pt-BR") : "nunca"}</div></td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.active ? "bg-emerald-500/12 text-emerald-300" : "bg-amber-500/12 text-amber-300"}`}>{row.active ? "Ativa" : "Bloqueada"}</span></td>
                      <td className="px-5 py-4">{row.uses}</td>
                      <td className="px-5 py-4"><CreditEditor row={row} onSave={doSaveCredits} /></td>
                      <td className="px-5 py-4 text-muted-foreground">{new Date(row.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={() => doToggle(row)} className="secondary-button px-3 py-2 text-xs"><Power className="h-3.5 w-3.5" />{row.active ? "Bloquear" : "Ativar"}</button><button onClick={() => doDelete(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/15"><Trash2 className="h-3.5 w-3.5" />Excluir</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


function brazilDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function CreditEditor({ row, onSave }: { row: Row; onSave: (row: Row, credits: number, unlimited: boolean) => Promise<void> }) {
  const [credits, setCredits] = useState(row.credits_per_day);
  const [unlimited, setUnlimited] = useState(row.unlimited_credits);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCredits(row.credits_per_day);
    setUnlimited(row.unlimited_credits);
  }, [row.credits_per_day, row.unlimited_credits]);

  const used = row.credits_reset_date === brazilDate() ? row.credits_used_today : 0;

  return (
    <div className="min-w-[280px]">
      <div className="flex items-center gap-2">
        <input type="number" min={0} max={1000000} disabled={unlimited || saving} value={credits} onChange={(event) => setCredits(Math.max(0, Number(event.target.value) || 0))} className="h-9 w-24 rounded-lg border border-border bg-[#0a0e1a] px-2 text-xs outline-none disabled:opacity-40" />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={unlimited} disabled={saving} onChange={(event) => setUnlimited(event.target.checked)} className="accent-violet-500" />
          Infinito
        </label>
        <button type="button" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(row, credits, unlimited); } finally { setSaving(false); } }} className="rounded-lg border border-primary/25 bg-primary/10 p-2 text-primary disabled:opacity-50" title="Salvar créditos">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{unlimited ? "Uso ilimitado" : `${Math.max(credits - used, 0)} restantes hoje · ${used} usados`}</div>
    </div>
  );
}

function AdminMetric({ icon: Icon, value, label, tone }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; tone?: "success" | "warning" }) {
  const iconClass = tone === "success" ? "bg-emerald-500/12 text-emerald-300" : tone === "warning" ? "bg-amber-500/12 text-amber-300" : "bg-primary/15 text-primary";
  return <div className="panel p-5"><div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" /></div><div className="text-3xl font-bold">{value}</div><div className="mt-1 text-sm text-muted-foreground">{label}</div></div>;
}

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-white">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
