import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileEdit,
  ImageIcon,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { listBrandProfiles } from "@/lib/brand.functions";
import {
  addContentComment,
  changeContentStatus,
  deleteContentItem,
  listContentComments,
  listContentItems,
  listSocialAccounts,
  markContentPublished,
  publishContentNow,
  saveContentItem,
} from "@/lib/social.functions";
import { getAccessKey } from "@/lib/session";
import { loadProjects, type Project } from "@/lib/storage";

export const Route = createFileRoute("/publicacoes")({
  head: () => ({ meta: [{ title: "Publicações — Zunexi.ai" }] }),
  component: PublicacoesRoute,
});

type Platform = "instagram" | "facebook" | "threads" | "tiktok" | "linkedin" | "youtube" | "pinterest" | "x" | "google_business" | "outro";
type ContentStatus = "rascunho" | "em_revisao" | "alteracoes" | "aprovado" | "agendado" | "publicando" | "publicado" | "falhou" | "arquivado";
type ContentType = "carrossel" | "cartaz" | "reel" | "story" | "post" | "video" | "outro";
type ContentItem = {
  id: string;
  brand_profile_id: string | null;
  owner_member_id: string;
  title: string;
  caption: string;
  content_type: ContentType;
  status: ContentStatus;
  platforms: Platform[];
  social_account_ids: string[];
  media_urls: string[];
  project_id: string | null;
  campaign: string;
  tags: string[];
  scheduled_for: string | null;
  approved_at: string | null;
  published_at: string | null;
  publish_results: Array<Record<string, unknown>>;
  error_message: string;
  created_at: string;
  updated_at: string;
};
type Account = { id: string; account_name: string; platform: Platform; status: string; brand_profile_id: string | null };
type Brand = { id: string; name: string; is_primary: boolean };
type Comment = { id: string; body: string; created_at: string; tenant_members?: { display_name?: string; role?: string } };
type FormState = {
  id: string | null;
  brandId: string;
  title: string;
  caption: string;
  contentType: ContentType;
  status: ContentStatus;
  platforms: Platform[];
  socialAccountIds: string[];
  mediaUrlsText: string;
  projectId: string;
  campaign: string;
  tagsText: string;
  scheduledFor: string;
};

const EMPTY: FormState = {
  id: null,
  brandId: "",
  title: "",
  caption: "",
  contentType: "post",
  status: "rascunho",
  platforms: ["instagram"],
  socialAccountIds: [],
  mediaUrlsText: "",
  projectId: "",
  campaign: "",
  tagsText: "",
  scheduledFor: "",
};

const STATUS_META: Record<ContentStatus, { label: string; className: string; icon: typeof CircleDashed }> = {
  rascunho: { label: "Rascunho", className: "border-border bg-secondary/55 text-muted-foreground", icon: CircleDashed },
  em_revisao: { label: "Em revisão", className: "border-blue-400/20 bg-blue-500/10 text-blue-700 dark:text-blue-300", icon: FileEdit },
  alteracoes: { label: "Alterações", className: "border-amber-400/20 bg-amber-500/10 text-amber-700 dark:text-amber-300", icon: RotateCcw },
  aprovado: { label: "Aprovado", className: "border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: FileCheck2 },
  agendado: { label: "Agendado", className: "border-primary/25 bg-primary/10 text-primary", icon: CalendarClock },
  publicando: { label: "Publicando", className: "border-violet-400/20 bg-violet-500/10 text-violet-700 dark:text-violet-300", icon: Loader2 },
  publicado: { label: "Publicado", className: "border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
  falhou: { label: "Falhou", className: "border-red-400/20 bg-red-500/10 text-red-700 dark:text-red-300", icon: X },
  arquivado: { label: "Arquivado", className: "border-border bg-secondary/40 text-muted-foreground", icon: MoreHorizontal },
};

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram", facebook: "Facebook", threads: "Threads", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", pinterest: "Pinterest", x: "X", google_business: "Google Empresa", outro: "Outro",
};

function PublicacoesRoute() {
  return <AppShell><PlanGate feature="publicacoes"><PublicacoesPage /></PlanGate></AppShell>;
}

function PublicacoesPage() {
  const accessKey = getAccessKey() || "";
  const getItems = useServerFn(listContentItems);
  const saveItem = useServerFn(saveContentItem);
  const removeItem = useServerFn(deleteContentItem);
  const changeStatus = useServerFn(changeContentStatus);
  const publishNow = useServerFn(publishContentNow);
  const markPublished = useServerFn(markContentPublished);
  const getAccounts = useServerFn(listSocialAccounts);
  const getBrands = useServerFn(listBrandProfiles);
  const getComments = useServerFn(listContentComments);
  const addComment = useServerFn(addContentComment);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ContentStatus | "todos">("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [detail, setDetail] = useState<ContentItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [rows, accountRows, brandResult] = await Promise.all([
        getItems({ data: { accessKey, limit: 250 } }),
        getAccounts({ data: { accessKey } }),
        getBrands({ data: { accessKey } }).catch(() => ({ brands: [] })),
      ]);
      setItems(rows as ContentItem[]);
      setAccounts(accountRows as Account[]);
      setBrands((brandResult.brands || []) as Brand[]);
      setProjects(loadProjects());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesStatus = filter === "todos" || item.status === filter;
    const search = query.trim().toLowerCase();
    const matchesQuery = !search || `${item.title} ${item.caption} ${item.campaign} ${(item.tags || []).join(" ")}`.toLowerCase().includes(search);
    return matchesStatus && matchesQuery;
  }), [items, filter, query]);

  const summary = useMemo(() => ({
    drafts: items.filter((item) => item.status === "rascunho").length,
    review: items.filter((item) => ["em_revisao", "alteracoes"].includes(item.status)).length,
    scheduled: items.filter((item) => item.status === "agendado").length,
    published: items.filter((item) => item.status === "publicado").length,
  }), [items]);

  function openCreate(project?: Project) {
    const brandId = brands.find((brand) => brand.is_primary)?.id || brands[0]?.id || "";
    setForm({
      ...EMPTY,
      brandId,
      projectId: project?.id || "",
      title: project?.name || "",
      contentType: project?.type === "carrossel" ? "carrossel" : project?.type === "cartaz" ? "cartaz" : "post",
      mediaUrlsText: project?.slides?.map((slide) => slide.thumb).filter((value): value is string => Boolean(value && /^https?:\/\//.test(value))).join("\n") || "",
    });
    setModalOpen(true);
  }

  function openEdit(item: ContentItem) {
    setForm({
      id: item.id,
      brandId: item.brand_profile_id || "",
      title: item.title,
      caption: item.caption || "",
      contentType: item.content_type,
      status: item.status,
      platforms: Array.isArray(item.platforms) ? item.platforms : [],
      socialAccountIds: Array.isArray(item.social_account_ids) ? item.social_account_ids : [],
      mediaUrlsText: (item.media_urls || []).join("\n"),
      projectId: item.project_id || "",
      campaign: item.campaign || "",
      tagsText: (item.tags || []).join(", "),
      scheduledFor: item.scheduled_for ? toLocalDateTime(item.scheduled_for) : "",
    });
    setModalOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.platforms.length) return toast.error("Selecione pelo menos uma rede.");
    const mediaUrls = form.mediaUrlsText.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    for (const url of mediaUrls) {
      try { new URL(url); } catch { return toast.error(`URL de mídia inválida: ${url}`); }
    }
    setSaving(true);
    try {
      await saveItem({ data: { accessKey, content: {
        id: form.id,
        brandId: form.brandId || null,
        title: form.title,
        caption: form.caption,
        contentType: form.contentType,
        status: form.status,
        platforms: form.platforms,
        socialAccountIds: form.socialAccountIds,
        mediaUrls,
        projectId: form.projectId || null,
        campaign: form.campaign,
        tags: form.tagsText.split(",").map((item) => item.trim()).filter(Boolean),
        scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : null,
      } } });
      toast.success(form.id ? "Conteúdo atualizado." : "Conteúdo adicionado ao fluxo editorial.");
      setModalOpen(false);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function move(item: ContentItem, status: ContentStatus, scheduledFor?: string | null) {
    setWorkingId(item.id);
    try {
      await changeStatus({ data: { accessKey, id: item.id, status, scheduledFor: scheduledFor || null } });
      toast.success(`Conteúdo movido para ${STATUS_META[status].label}.`);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  async function publish(item: ContentItem) {
    if (!confirm(`Publicar “${item.title}” agora nas contas conectadas selecionadas?`)) return;
    setWorkingId(item.id);
    try {
      await publishNow({ data: { accessKey, id: item.id } });
      toast.success("Publicação enviada para as redes conectadas.");
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
      await refresh();
    } finally {
      setWorkingId(null);
    }
  }

  async function manualPublished(item: ContentItem) {
    setWorkingId(item.id);
    try {
      await markPublished({ data: { accessKey, id: item.id } });
      toast.success("Conteúdo marcado como publicado manualmente.");
      await refresh();
    } catch (error) { toast.error((error as Error).message); }
    finally { setWorkingId(null); }
  }

  async function remove(item: ContentItem) {
    if (!confirm(`Excluir “${item.title}” do fluxo editorial?`)) return;
    setWorkingId(item.id);
    try {
      await removeItem({ data: { accessKey, id: item.id } });
      toast.success("Conteúdo excluído.");
      await refresh();
    } catch (error) { toast.error((error as Error).message); }
    finally { setWorkingId(null); }
  }

  async function openDetail(item: ContentItem) {
    setDetail(item);
    setCommentText("");
    try { setComments(await getComments({ data: { accessKey, contentId: item.id } }) as Comment[]); }
    catch { setComments([]); }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!detail || !commentText.trim()) return;
    setCommenting(true);
    try {
      await addComment({ data: { accessKey, contentId: detail.id, body: commentText } });
      setCommentText("");
      setComments(await getComments({ data: { accessKey, contentId: detail.id } }) as Comment[]);
    } catch (error) { toast.error((error as Error).message); }
    finally { setCommenting(false); }
  }

  return (
    <div className="page-wrap space-y-6">
      <section className="studio-hero panel relative overflow-hidden p-6 sm:p-8">
        <div className="studio-hero-grid" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="eyebrow mb-3 flex items-center gap-2"><Rocket className="h-3.5 w-3.5 text-primary" /> Fluxo editorial</div><h1 className="section-title text-3xl sm:text-5xl">Publicações</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Crie o conteúdo, peça revisão, aprove, agende e publique sem perder o histórico da equipe.</p></div>
          <div className="flex flex-wrap gap-3"><Link to="/carrossel" className="secondary-button"><ImageIcon className="h-4 w-4" /> Criar com IA</Link><button onClick={() => openCreate()} className="primary-button"><Plus className="h-4 w-4" /> Novo conteúdo</button></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric value={summary.drafts} label="Rascunhos" icon={CircleDashed} />
        <Metric value={summary.review} label="Em revisão" icon={FileEdit} />
        <Metric value={summary.scheduled} label="Agendados" icon={CalendarClock} />
        <Metric value={summary.published} label="Publicados" icon={CheckCircle2} />
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="section-title text-xl">Pipeline de conteúdo</h2><p className="mt-1 text-xs text-muted-foreground">Todos os dados ficam separados por empresa e marca.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5 sm:w-72"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conteúdo..." className="w-full bg-transparent text-sm outline-none" /></div>
            <select value={filter} onChange={(event) => setFilter(event.target.value as ContentStatus | "todos")} className="app-input h-11 sm:w-48"><option value="todos">Todos os status</option>{Object.entries(STATUS_META).map(([status, meta]) => <option key={status} value={status}>{meta.label}</option>)}</select>
          </div>
        </div>

        {loading ? <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : filtered.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-8 text-center"><div><FileEdit className="mx-auto h-9 w-9 text-primary" /><h3 className="mt-4 font-semibold">Nenhum conteúdo encontrado</h3><p className="mt-2 text-sm text-muted-foreground">Adicione um projeto criado pela Zunexi ou monte uma publicação manual.</p><button onClick={() => openCreate()} className="primary-button mx-auto mt-5"><Plus className="h-4 w-4" /> Criar conteúdo</button></div></div>
        ) : (
          <div className="divide-y divide-border/80">
            {filtered.map((item) => <ContentRow key={item.id} item={item} brand={brands.find((brand) => brand.id === item.brand_profile_id)} project={projects.find((project) => project.id === item.project_id)} accounts={accounts} working={workingId === item.id} onEdit={() => openEdit(item)} onDetail={() => void openDetail(item)} onMove={(status, date) => void move(item, status, date)} onPublish={() => void publish(item)} onManual={() => void manualPublished(item)} onDelete={() => void remove(item)} />)}
          </div>
        )}
      </section>

      {projects.length > 0 && (
        <section className="panel p-5 sm:p-6"><div className="flex items-end justify-between gap-4"><div><h2 className="section-title text-xl">Projetos prontos para o fluxo</h2><p className="mt-1 text-xs text-muted-foreground">Adicione uma criação já salva sem copiar os arquivos manualmente.</p></div><Link to="/projetos" className="secondary-button hidden sm:inline-flex">Ver projetos <ExternalLink className="h-4 w-4" /></Link></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{projects.slice(0, 8).map((project) => <button key={project.id} onClick={() => openCreate(project)} className="rounded-2xl border border-border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"><div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{project.type}</div><h3 className="mt-2 truncate text-sm font-semibold">{project.name}</h3><p className="mt-1 text-[11px] text-muted-foreground">{project.slides.length} arquivo(s) · adicionar ao pipeline</p></button>)}</div></section>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <form onSubmit={submit} className="panel max-h-[94vh] w-full max-w-4xl overflow-y-auto p-5 sm:p-7">
            <div className="mb-6 flex items-start justify-between"><div><div className="eyebrow">Conteúdo social</div><h2 className="section-title mt-1 text-2xl">{form.id ? "Editar publicação" : "Novo conteúdo"}</h2></div><button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-border p-2"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Título interno" wide><input className="app-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Campanha de lançamento — semana 1" required /></Field>
              <Field label="Marca"><select className="app-input" value={form.brandId} onChange={(event) => setForm({ ...form, brandId: event.target.value })}><option value="">Marca principal</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Field>
              <Field label="Formato"><select className="app-input" value={form.contentType} onChange={(event) => setForm({ ...form, contentType: event.target.value as ContentType })}><option value="post">Post</option><option value="carrossel">Carrossel</option><option value="cartaz">Cartaz</option><option value="reel">Reel</option><option value="story">Story</option><option value="video">Vídeo</option><option value="outro">Outro</option></select></Field>
              <Field label="Campanha"><input className="app-input" value={form.campaign} onChange={(event) => setForm({ ...form, campaign: event.target.value })} placeholder="Ex.: Lançamento de agosto" /></Field>
              <Field label="Projeto Zunexi"><select className="app-input" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}><option value="">Sem projeto vinculado</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.type}</option>)}</select></Field>
              <Field label="Status"><select className="app-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ContentStatus })}>{Object.entries(STATUS_META).map(([status, meta]) => <option key={status} value={status}>{meta.label}</option>)}</select></Field>
              <Field label="Data e horário"><input type="datetime-local" className="app-input" value={form.scheduledFor} onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })} /></Field>
              <Field label="Redes" wide><div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{Object.entries(PLATFORM_LABELS).map(([platform, label]) => <label key={platform} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${form.platforms.includes(platform as Platform) ? "border-primary/40 bg-primary/10 text-primary" : "border-border"}`}><input type="checkbox" checked={form.platforms.includes(platform as Platform)} onChange={() => setForm((current) => ({ ...current, platforms: toggleValue(current.platforms, platform as Platform) }))} className="accent-violet-500" />{label}</label>)}</div></Field>
              <Field label="Contas específicas" wide><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{accounts.filter((account) => form.platforms.includes(account.platform)).map((account) => <label key={account.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${form.socialAccountIds.includes(account.id) ? "border-primary/40 bg-primary/10 text-primary" : "border-border"}`}><input type="checkbox" checked={form.socialAccountIds.includes(account.id)} onChange={() => setForm((current) => ({ ...current, socialAccountIds: toggleValue(current.socialAccountIds, account.id) }))} className="accent-violet-500" />{account.account_name}</label>)}{accounts.filter((account) => form.platforms.includes(account.platform)).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma conta conectada para as redes escolhidas. Você ainda pode salvar e publicar manualmente.</p>}</div></Field>
              <Field label="Legenda" wide><textarea className="app-input min-h-36 resize-y" value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} placeholder="Legenda completa, CTA e hashtags." /></Field>
              <Field label="URLs públicas das imagens ou vídeos" wide><textarea className="app-input min-h-28 resize-y font-mono text-xs" value={form.mediaUrlsText} onChange={(event) => setForm({ ...form, mediaUrlsText: event.target.value })} placeholder="Uma URL por linha. Para publicar pela Meta, os arquivos precisam estar acessíveis publicamente." /></Field>
              <Field label="Tags internas" wide><input className="app-input" value={form.tagsText} onChange={(event) => setForm({ ...form, tagsText: event.target.value })} placeholder="lançamento, autoridade, agosto" /></Field>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setModalOpen(false)} className="secondary-button">Cancelar</button><button disabled={saving} className="primary-button disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar conteúdo</button></div>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[95] flex justify-end bg-black/65 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}>
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between"><div><StatusBadge status={detail.status} /><h2 className="section-title mt-3 text-2xl">{detail.title}</h2><p className="mt-2 text-xs text-muted-foreground">Atualizado em {new Date(detail.updated_at).toLocaleString("pt-BR")}</p></div><button onClick={() => setDetail(null)} className="rounded-xl border border-border p-2"><X className="h-4 w-4" /></button></div>
            <div className="mt-6 rounded-2xl border border-border bg-white/[.018] p-4"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Legenda</div><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{detail.caption || "Sem legenda."}</p></div>
            {detail.error_message && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/8 p-4 text-xs leading-relaxed text-red-700 dark:text-red-200">{detail.error_message}</div>}
            <div className="mt-7"><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-primary" /><h3 className="font-semibold">Comentários internos</h3></div><div className="mt-4 space-y-3">{comments.length === 0 ? <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Nenhum comentário neste conteúdo.</div> : comments.map((comment) => <div key={comment.id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">{comment.tenant_members?.display_name || "Membro da equipe"}</span><span className="text-[10px] text-muted-foreground">{new Date(comment.created_at).toLocaleString("pt-BR")}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{comment.body}</p></div>)}</div><form onSubmit={submitComment} className="mt-4"><textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} className="app-input min-h-24 resize-y" placeholder="Escreva uma observação, correção ou aprovação..." /><button disabled={commenting || !commentText.trim()} className="primary-button mt-3 disabled:opacity-50">{commenting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar comentário</button></form></div>
          </aside>
        </div>
      )}
    </div>
  );
}

function ContentRow({ item, brand, project, accounts, working, onEdit, onDetail, onMove, onPublish, onManual, onDelete }: { item: ContentItem; brand?: Brand; project?: Project; accounts: Account[]; working: boolean; onEdit: () => void; onDetail: () => void; onMove: (status: ContentStatus, scheduledFor?: string | null) => void; onPublish: () => void; onManual: () => void; onDelete: () => void }) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState(item.scheduled_for ? toLocalDateTime(item.scheduled_for) : "");
  return (
    <article className="p-4 transition hover:bg-white/[.018] sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <button onClick={onDetail} className="flex min-w-0 flex-1 items-start gap-4 text-left"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary"><ImageIcon className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{item.title}</h3><StatusBadge status={item.status} /></div><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.caption || "Sem legenda"}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">{brand && <span>{brand.name}</span>}{project && <span>· {project.name}</span>}<span>· {item.content_type}</span>{item.scheduled_for && <span>· {new Date(item.scheduled_for).toLocaleString("pt-BR")}</span>}</div></div></button>
        <div className="flex flex-wrap items-center gap-2">{(item.platforms || []).map((platform) => <span key={platform} className="rounded-full border border-border px-2.5 py-1 text-[10px]">{PLATFORM_LABELS[platform]}</span>)}</div>
        <div className="relative flex shrink-0 items-center gap-2">
          {working ? <div className="grid h-10 w-10 place-items-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div> : <>
            {item.status === "rascunho" && <button onClick={() => onMove("em_revisao")} className="secondary-button px-3 py-2 text-xs"><FileEdit className="h-3.5 w-3.5" /> Enviar para revisão</button>}
            {["em_revisao", "alteracoes"].includes(item.status) && <button onClick={() => onMove("aprovado")} className="primary-button px-3 py-2 text-xs"><FileCheck2 className="h-3.5 w-3.5" /> Aprovar</button>}
            {["aprovado", "agendado", "falhou"].includes(item.status) && <button onClick={onPublish} className="primary-button px-3 py-2 text-xs"><Rocket className="h-3.5 w-3.5" /> Publicar</button>}
            <button onClick={() => setActionsOpen((value) => !value)} className="rounded-xl border border-border p-2.5"><MoreHorizontal className="h-4 w-4" /></button>
          </>}
          {actionsOpen && <div className="absolute right-0 top-12 z-20 min-w-56 rounded-xl border border-border bg-popover p-2 shadow-2xl"><Action onClick={() => { setActionsOpen(false); onEdit(); }} icon={Pencil} label="Editar conteúdo" /><Action onClick={() => { setActionsOpen(false); onDetail(); }} icon={MessageSquareText} label="Comentários e detalhes" />{["aprovado", "alteracoes"].includes(item.status) && <Action onClick={() => { setActionsOpen(false); setScheduleOpen(true); }} icon={CalendarClock} label="Agendar publicação" />}{item.status !== "publicado" && <Action onClick={() => { setActionsOpen(false); onManual(); }} icon={CheckCircle2} label="Marcar como publicado" />}{item.status === "em_revisao" && <Action onClick={() => { setActionsOpen(false); onMove("alteracoes"); }} icon={RotateCcw} label="Solicitar alterações" />}<Action onClick={() => { setActionsOpen(false); onMove("arquivado"); }} icon={MoreHorizontal} label="Arquivar" /><Action onClick={() => { setActionsOpen(false); onDelete(); }} icon={Trash2} label="Excluir" destructive /></div>}
        </div>
      </div>
      {scheduleOpen && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-end"><label className="flex-1"><span className="mb-2 block text-xs font-semibold">Data e horário</span><input type="datetime-local" className="app-input" value={schedule} onChange={(event) => setSchedule(event.target.value)} /></label><button onClick={() => { if (!schedule) return; onMove("agendado", new Date(schedule).toISOString()); setScheduleOpen(false); }} className="primary-button"><Clock3 className="h-4 w-4" /> Confirmar agenda</button><button onClick={() => setScheduleOpen(false)} className="secondary-button">Cancelar</button></div>}
      {item.error_message && <p className="mt-3 rounded-xl border border-red-400/15 bg-red-500/7 p-3 text-[11px] leading-relaxed text-red-700 dark:text-red-200">{item.error_message}</p>}
    </article>
  );
}

function StatusBadge({ status }: { status: ContentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider ${meta.className}`}><Icon className={`h-3 w-3 ${status === "publicando" ? "animate-spin" : ""}`} />{meta.label}</span>;
}
function Action({ icon: Icon, label, onClick, destructive }: { icon: typeof Pencil; label: string; onClick: () => void; destructive?: boolean }) { return <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-secondary ${destructive ? "text-destructive" : ""}`}><Icon className="h-3.5 w-3.5" />{label}</button>; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-semibold">{label}</span>{children}</label>; }
function Metric({ value, label, icon: Icon }: { value: number; label: string; icon: typeof CircleDashed }) { return <div className="panel flex items-center gap-4 p-5"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary"><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></div>; }
function toggleValue<T>(values: T[], value: T) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function toLocalDateTime(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
