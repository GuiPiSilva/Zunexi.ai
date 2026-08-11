import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  AtSign,
  Building2,
  CheckCircle2,
  CircleOff,
  Eye,
  EyeOff,
  Facebook,
  Instagram,
  KeyRound,
  LogIn,
  Linkedin,
  Loader2,
  Music2,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  X,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { listBrandProfiles } from "@/lib/brand.functions";
import { createMetaOAuthUrl, deleteSocialAccount, listSocialAccounts, saveSocialAccount, testSocialAccount } from "@/lib/social.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/redes")({
  head: () => ({ meta: [{ title: "Redes conectadas — Zunexi.ai" }] }),
  component: RedesRoute,
});

type Platform = "instagram" | "facebook" | "threads" | "tiktok" | "linkedin" | "youtube" | "pinterest" | "x" | "google_business" | "outro";
type Account = {
  id: string;
  brand_profile_id: string | null;
  platform: Platform;
  account_name: string;
  username: string;
  external_account_id: string;
  page_id: string;
  instagram_business_account_id: string;
  status: "connected" | "attention" | "disconnected";
  token_expires_at: string | null;
  has_access_token: boolean;
  last_sync_at: string | null;
  metadata?: Record<string, unknown>;
};
type Brand = { id: string; name: string; is_primary: boolean };
type FormState = {
  id: string | null;
  brandId: string;
  platform: Platform;
  accountName: string;
  username: string;
  externalAccountId: string;
  pageId: string;
  instagramBusinessAccountId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  status: "connected" | "attention" | "disconnected";
};

const EMPTY: FormState = {
  id: null,
  brandId: "",
  platform: "instagram",
  accountName: "",
  username: "",
  externalAccountId: "",
  pageId: "",
  instagramBusinessAccountId: "",
  accessToken: "",
  refreshToken: "",
  tokenExpiresAt: "",
  status: "connected",
};

const PLATFORM_META: Record<Platform, { label: string; icon: typeof Instagram; description: string; automatic: boolean }> = {
  instagram: { label: "Instagram", icon: Instagram, description: "Posts, carrosséis, Reels, Stories, comentários e mensagens.", automatic: true },
  facebook: { label: "Facebook", icon: Facebook, description: "Páginas, posts, fotos, vídeos, comentários e Messenger.", automatic: true },
  threads: { label: "Threads", icon: AtSign, description: "Conta preparada para sincronização e publicação via API oficial.", automatic: false },
  tiktok: { label: "TikTok", icon: Music2, description: "Perfil, métricas e fluxo editorial da conta.", automatic: false },
  linkedin: { label: "LinkedIn", icon: Linkedin, description: "Perfis e páginas profissionais no mesmo calendário.", automatic: false },
  youtube: { label: "YouTube", icon: Youtube, description: "Canais, vídeos, Shorts e métricas.", automatic: false },
  pinterest: { label: "Pinterest", icon: Network, description: "Conta e painéis organizados por marca.", automatic: false },
  x: { label: "X", icon: AtSign, description: "Conta, publicações e acompanhamento editorial.", automatic: false },
  google_business: { label: "Google Perfil da Empresa", icon: Building2, description: "Conta preparada para posts e avaliações.", automatic: false },
  outro: { label: "Outro canal", icon: Network, description: "Cadastro manual para organização e calendário.", automatic: false },
};

function RedesRoute() {
  return <AppShell><PlanGate feature="gestao_redes"><RedesPage /></PlanGate></AppShell>;
}

function RedesPage() {
  const accessKey = getAccessKey() || "";
  const getAccounts = useServerFn(listSocialAccounts);
  const startMetaOAuth = useServerFn(createMetaOAuthUrl);
  const saveAccount = useServerFn(saveSocialAccount);
  const testAccount = useServerFn(testSocialAccount);
  const removeAccount = useServerFn(deleteSocialAccount);
  const getBrands = useServerFn(listBrandProfiles);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  async function refresh() {
    setLoading(true);
    try {
      const [accountRows, brandResult] = await Promise.all([
        getAccounts({ data: { accessKey } }),
        getBrands({ data: { accessKey } }).catch(() => ({ brands: [] })),
      ]);
      setAccounts(accountRows as Account[]);
      setBrands((brandResult.brands || []) as Brand[]);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (!oauth) return;
    if (oauth === "success") {
      const connected = Number(params.get("connected") || 0);
      toast.success(connected > 1 ? `${connected} contas Meta conectadas automaticamente.` : "Conta Meta conectada automaticamente.");
      void refresh();
    } else {
      toast.error(params.get("message") || "Não foi possível concluir o login com a Meta.");
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const counts = useMemo(() => ({
    connected: accounts.filter((item) => item.status === "connected").length,
    attention: accounts.filter((item) => item.status === "attention").length,
    disconnected: accounts.filter((item) => item.status === "disconnected").length,
  }), [accounts]);

  function openCreate(platform: Platform = "instagram") {
    setForm({ ...EMPTY, platform, brandId: brands.find((brand) => brand.is_primary)?.id || brands[0]?.id || "" });
    setShowToken(false);
    setModalOpen(true);
  }

  function openEdit(account: Account) {
    setForm({
      id: account.id,
      brandId: account.brand_profile_id || "",
      platform: account.platform,
      accountName: account.account_name,
      username: account.username || "",
      externalAccountId: account.external_account_id || "",
      pageId: account.page_id || "",
      instagramBusinessAccountId: account.instagram_business_account_id || "",
      accessToken: "",
      refreshToken: "",
      tokenExpiresAt: account.token_expires_at ? account.token_expires_at.slice(0, 16) : "",
      status: account.status,
    });
    setShowToken(false);
    setModalOpen(true);
  }

  async function connectMeta() {
    if (oauthBusy) return;
    setOauthBusy(true);
    try {
      const brandId = brands.find((brand) => brand.is_primary)?.id || brands[0]?.id || null;
      const result = await startMetaOAuth({ data: { accessKey, brandId } });
      window.location.assign(result.url);
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível iniciar o login com a Meta.");
      setOauthBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveAccount({ data: {
        accessKey,
        account: {
          id: form.id,
          brandId: form.brandId || null,
          platform: form.platform,
          accountName: form.accountName,
          username: form.username,
          externalAccountId: form.externalAccountId,
          pageId: form.pageId,
          instagramBusinessAccountId: form.instagramBusinessAccountId,
          accessToken: form.accessToken,
          refreshToken: form.refreshToken,
          tokenExpiresAt: form.tokenExpiresAt ? new Date(form.tokenExpiresAt).toISOString() : null,
          status: form.status,
        },
      } });
      toast.success(form.id ? "Conta atualizada com segurança." : "Conta conectada à Zunexi.ai.");
      setModalOpen(false);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(account: Account) {
    setTestingId(account.id);
    try {
      await testAccount({ data: { accessKey, id: account.id } });
      toast.success(`Conexão com ${account.account_name} validada.`);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
      await refresh();
    } finally {
      setTestingId(null);
    }
  }

  async function remove(account: Account) {
    if (!confirm(`Desconectar ${account.account_name}? Os conteúdos e métricas já salvos continuarão no sistema.`)) return;
    try {
      await removeAccount({ data: { accessKey, id: account.id } });
      toast.success("Conta desconectada.");
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="page-wrap space-y-6">
      <section className="studio-hero panel relative overflow-hidden p-6 sm:p-8">
        <div className="studio-hero-grid" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow mb-3 flex items-center gap-2"><Wifi className="h-3.5 w-3.5 text-primary" /> Central de canais</div>
            <h1 className="section-title text-3xl sm:text-5xl">Redes conectadas</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Conecte cada perfil à marca correta. Os tokens ficam criptografados no servidor e nunca são enviados de volta ao navegador.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row"><button onClick={() => void connectMeta()} disabled={oauthBusy} className="primary-button justify-center disabled:opacity-60">{oauthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Conectar Instagram / Facebook</button><button onClick={() => openCreate()} className="secondary-button justify-center"><Plus className="h-4 w-4" /> Conexão manual</button></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric value={counts.connected} label="Conectadas" icon={CheckCircle2} tone="success" />
        <Metric value={counts.attention} label="Precisam de atenção" icon={AlertTriangle} tone="warning" />
        <Metric value={counts.disconnected} label="Desconectadas" icon={CircleOff} />
      </section>

      <section className="panel p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="section-title text-xl">Suas contas</h2><p className="mt-1 text-xs text-muted-foreground">Instagram e Facebook já possuem publicação e resposta direta pela API da Meta.</p></div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-[11px] text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Tokens protegidos por AES-256-GCM</div>
        </div>
        {loading ? (
          <div className="grid min-h-56 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : accounts.length === 0 ? (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border p-8 text-center">
            <div><Network className="mx-auto h-9 w-9 text-primary" /><h3 className="mt-4 font-semibold">Nenhuma rede conectada</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">Comece pelo Instagram profissional ou pela Página do Facebook que será usada para publicar.</p><button onClick={() => void connectMeta()} disabled={oauthBusy} className="primary-button mx-auto mt-5 disabled:opacity-60">{oauthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Entrar com Instagram / Facebook</button></div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {accounts.map((account) => {
              const meta = PLATFORM_META[account.platform];
              const Icon = meta.icon;
              const brand = brands.find((item) => item.id === account.brand_profile_id);
              return (
                <article key={account.id} className="rounded-2xl border border-border bg-white/[.018] p-5 transition hover:border-primary/35">
                  <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold">{account.account_name}</h3><StatusBadge status={account.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{meta.label}{account.username ? ` · @${account.username.replace(/^@/, "")}` : ""}</p>{brand && <span className="mt-2 inline-flex rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{brand.name}</span>}</div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <Info label="Token" value={account.has_access_token ? "Armazenado" : "Ausente"} />
                    <Info label="Último teste" value={account.last_sync_at ? new Date(account.last_sync_at).toLocaleDateString("pt-BR") : "Nunca"} />
                  </div>
                  {!meta.automatic && <p className="mt-4 rounded-xl border border-amber-400/15 bg-amber-500/7 p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-100/75">O fluxo editorial funciona agora. A publicação direta será liberada quando o aplicativo dessa rede e suas permissões oficiais forem configurados.</p>}
                  <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void testConnection(account)} disabled={testingId === account.id} className="secondary-button px-3 py-2 text-xs disabled:opacity-60">{testingId === account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Testar</button><button onClick={() => openEdit(account)} className="secondary-button px-3 py-2 text-xs"><KeyRound className="h-3.5 w-3.5" /> Configurar</button><button onClick={() => void remove(account)} className="ml-auto rounded-xl border border-destructive/25 p-2.5 text-destructive hover:bg-destructive/10" title="Desconectar"><Trash2 className="h-4 w-4" /></button></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="section-title text-xl">Adicionar outro canal</h2>
        <p className="mt-1 text-xs text-muted-foreground">Instagram e Facebook podem ser conectados por login automático. Os demais canais continuam com cadastro manual até configurarmos o aplicativo OAuth de cada plataforma.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.entries(PLATFORM_META) as [Platform, (typeof PLATFORM_META)[Platform]][]).map(([platform, meta]) => {
            const Icon = meta.icon;
            const isMeta = platform === "instagram" || platform === "facebook";
            return <button key={platform} onClick={() => isMeta ? void connectMeta() : openCreate(platform)} disabled={isMeta && oauthBusy} className="rounded-2xl border border-border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"><Icon className="h-5 w-5 text-primary" /><div className="mt-3 flex items-center gap-2 text-sm font-semibold">{meta.label}{isMeta && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-primary">Login automático</span>}</div><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{meta.description}</p></button>;
          })}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <form onSubmit={submit} className="panel max-h-[94vh] w-full max-w-3xl overflow-y-auto p-5 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4"><div><div className="eyebrow">Conector seguro</div><h2 className="section-title mt-1 text-2xl">{form.id ? "Configurar conta" : `Conectar ${PLATFORM_META[form.platform].label}`}</h2></div><button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-border p-2"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rede"><select className="app-input" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as Platform })}>{Object.entries(PLATFORM_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field>
              <Field label="Marca"><select className="app-input" value={form.brandId} onChange={(event) => setForm({ ...form, brandId: event.target.value })}><option value="">Sem marca específica</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.is_primary ? " · principal" : ""}</option>)}</select></Field>
              <Field label="Nome da conta" wide><input className="app-input" value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} placeholder="Ex.: Zunexi.ai Oficial" required /></Field>
              <Field label="Usuário"><input className="app-input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="zunexi.ai" /></Field>
              <Field label="ID externo da conta"><input className="app-input" value={form.externalAccountId} onChange={(event) => setForm({ ...form, externalAccountId: event.target.value })} placeholder="ID fornecido pela plataforma" /></Field>
              {form.platform === "facebook" && <Field label="ID da Página do Facebook" wide><input className="app-input" value={form.pageId} onChange={(event) => setForm({ ...form, pageId: event.target.value })} placeholder="Ex.: 123456789012345" required /></Field>}
              {form.platform === "instagram" && <Field label="ID da conta profissional do Instagram" wide><input className="app-input" value={form.instagramBusinessAccountId} onChange={(event) => setForm({ ...form, instagramBusinessAccountId: event.target.value })} placeholder="Instagram Business Account ID" required /></Field>}
              <Field label={form.id ? "Novo token de acesso (deixe vazio para manter)" : "Token de acesso"} wide><div className="relative"><input type={showToken ? "text" : "password"} className="app-input pr-12 font-mono text-xs" value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} placeholder={form.id ? "O token atual continuará salvo" : "Cole o token oficial da plataforma"} /><button type="button" onClick={() => setShowToken((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></Field>
              <Field label="Expiração do token"><input type="datetime-local" className="app-input" value={form.tokenExpiresAt} onChange={(event) => setForm({ ...form, tokenExpiresAt: event.target.value })} /></Field>
              <Field label="Status"><select className="app-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })}><option value="connected">Conectada</option><option value="attention">Precisa de atenção</option><option value="disconnected">Desconectada</option></select></Field>
            </div>
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/7 p-4 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />O token será criptografado antes de ser gravado no Supabase. Para Instagram e Facebook, prefira o botão de login automático; esta tela fica disponível como alternativa manual e para manutenção.</div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setModalOpen(false)} className="secondary-button">Cancelar</button><button disabled={saving} className="primary-button disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} {form.id ? "Salvar configuração" : "Conectar conta"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-semibold">{label}</span>{children}</label>;
}

function StatusBadge({ status }: { status: Account["status"] }) {
  if (status === "connected") return <span className="rounded-full bg-emerald-500/12 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Conectada</span>;
  if (status === "attention") return <span className="rounded-full bg-amber-500/12 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Atenção</span>;
  return <span className="rounded-full bg-secondary px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Desconectada</span>;
}

function Metric({ value, label, icon: Icon, tone }: { value: number; label: string; icon: typeof CheckCircle2; tone?: "success" | "warning" }) {
  const style = tone === "success" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : tone === "warning" ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-primary/12 text-primary";
  return <div className="panel flex items-center gap-4 p-5"><div className={`grid h-11 w-11 place-items-center rounded-xl ${style}`}><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-white/[.018] p-3"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 truncate font-medium">{value}</div></div>;
}
