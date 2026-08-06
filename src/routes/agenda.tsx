import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { createScheduledPost, deleteScheduledPost, listScheduledPosts, updateScheduledPost } from "@/lib/planner.functions";
import { listBrandProfiles } from "@/lib/brand.functions";
import { getAccessKey } from "@/lib/session";
import { loadProjects, subscribeProjects, type Project } from "@/lib/storage";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/agenda")({
  head: () => ({ meta: [{ title: "Agenda de postagens — Zunexi.ai" }] }),
  component: AgendaRoute,
});

type ScheduledPost = Database["public"]["Tables"]["scheduled_posts"]["Row"];

type FormState = {
  title: string;
  caption: string;
  platform: "instagram" | "facebook" | "linkedin" | "tiktok" | "outro";
  contentType: "carrossel" | "cartaz" | "reel" | "story" | "post" | "outro";
  date: string;
  time: string;
  status: "rascunho" | "agendado" | "publicado";
  projectId: string;
  brandId: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  caption: "",
  platform: "instagram",
  contentType: "carrossel",
  date: format(new Date(), "yyyy-MM-dd"),
  time: "19:00",
  status: "agendado",
  projectId: "",
  brandId: "",
  notes: "",
};

const BEST_TIMES = [
  { platform: "Instagram", days: "Terça a quinta", times: "11h–13h ou 18h–21h" },
  { platform: "TikTok", days: "Terça, quinta e sábado", times: "12h–14h ou 19h–22h" },
  { platform: "LinkedIn", days: "Terça a quinta", times: "8h–10h ou 12h" },
  { platform: "Facebook", days: "Quarta a sexta", times: "11h–14h ou 18h" },
];

function AgendaRoute() {
  return (
    <AppShell>
      <PlanGate feature="agenda"><AgendaPage /></PlanGate>
    </AppShell>
  );
}

function AgendaPage() {
  const list = useServerFn(listScheduledPosts);
  const create = useServerFn(createScheduledPost);
  const update = useServerFn(updateScheduledPost);
  const remove = useServerFn(deleteScheduledPost);
  const listBrands = useServerFn(listBrandProfiles);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string; is_primary?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ScheduledPost | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const accessKey = getAccessKey() || "";

  const range = useMemo(() => ({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  }), [month]);
  const days = useMemo(() => eachDayOfInterval(range), [range]);

  async function refresh() {
    if (!accessKey) return;
    setLoading(true);
    try {
      const rows = await list({ data: { accessKey, from: range.start.toISOString(), to: new Date(range.end.getTime() + 86_400_000).toISOString() } });
      setPosts(rows as ScheduledPost[]);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [month]);
  useEffect(() => {
    const refreshProjects = () => setProjects(loadProjects());
    refreshProjects();
    const unsubscribe = subscribeProjects(refreshProjects);
    if (accessKey) {
      void listBrands({ data: { accessKey } })
        .then((result: any) => setBrands(result?.brands ?? []))
        .catch(() => setBrands([]));
    }
    return unsubscribe;
  }, [accessKey]);

  function projectName(projectId: string | null) {
    if (!projectId) return null;
    return projects.find((project) => project.id === projectId)?.name || "Projeto vinculado";
  }

  function openCreate(day = new Date()) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: format(day, "yyyy-MM-dd") });
    setEditorOpen(true);
  }

  function openEdit(post: ScheduledPost) {
    const date = parseISO(post.scheduled_for);
    setEditing(post);
    setForm({
      title: post.title,
      caption: post.caption,
      platform: post.platform as FormState["platform"],
      contentType: post.content_type as FormState["contentType"],
      date: format(date, "yyyy-MM-dd"),
      time: format(date, "HH:mm"),
      status: post.status as FormState["status"],
      projectId: post.project_id || "",
      brandId: post.brand_profile_id || "",
      notes: post.notes,
    });
    setEditorOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const scheduledFor = new Date(`${form.date}T${form.time}:00`).toISOString();
      const post = {
        title: form.title,
        caption: form.caption,
        platform: form.platform,
        contentType: form.contentType,
        scheduledFor,
        status: form.status,
        projectId: form.projectId || null,
        brandId: form.brandId || null,
        notes: form.notes,
      };
      if (editing) await update({ data: { accessKey, id: editing.id, post } });
      else await create({ data: { accessKey, post } });
      toast.success(editing ? "Postagem atualizada." : "Postagem adicionada à sua agenda.");
      setEditorOpen(false);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(post: ScheduledPost) {
    if (!confirm(`Excluir “${post.title}” da agenda?`)) return;
    try {
      await remove({ data: { accessKey, id: post.id } });
      setPosts((current) => current.filter((item) => item.id !== post.id));
      toast.success("Postagem removida da agenda.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const upcoming = posts.filter((post) => parseISO(post.scheduled_for).getTime() >= Date.now()).slice(0, 5);

  return (
    <div className="page-wrap space-y-6">
      <section className="studio-hero panel relative overflow-hidden p-6 sm:p-9">
        <div className="studio-hero-grid" />
        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="eyebrow mb-3 flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-primary" /> Planejamento inteligente</div>
            <h1 className="section-title max-w-3xl text-4xl leading-[.98] sm:text-6xl">Seu conteúdo no ritmo certo.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Organize o que será publicado, em qual data e horário. Esta agenda pertence somente à sua chave de acesso.</p>
          </div>
          <button onClick={() => openCreate()} className="primary-button shrink-0"><Plus className="h-4 w-4" /> Agendar conteúdo</button>
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
            <div>
              <h2 className="section-title text-xl capitalize">{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Clique em um dia para adicionar uma postagem.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMonth(subMonths(month, 1))} className="secondary-button px-3"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setMonth(startOfMonth(new Date()))} className="secondary-button px-3 text-xs">Hoje</button>
              <button onClick={() => setMonth(addMonths(month, 1))} className="secondary-button px-3"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 border-b border-border bg-white/[.018] text-center text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => <div key={label} className="py-3">{label}</div>)}
              </div>
              {loading ? <div className="grid min-h-[540px] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
                <div className="calendar-grid grid grid-cols-7">
                  {days.map((day) => {
                const dayPosts = posts.filter((post) => isSameDay(parseISO(post.scheduled_for), day));
                return (
                  <button key={day.toISOString()} onClick={() => openCreate(day)} className={`calendar-day min-h-28 border-b border-r border-border/70 p-2 text-left transition hover:bg-primary/[.055] sm:min-h-32 ${!isSameMonth(day, month) ? "opacity-35" : ""}`}>
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${isSameDay(day, new Date()) ? "bg-primary text-white" : "text-muted-foreground"}`}>{format(day, "d")}</span>
                    <div className="mt-2 space-y-1.5">
                      {dayPosts.slice(0, 3).map((post) => (
                        <span key={post.id} onClick={(event) => { event.stopPropagation(); openEdit(post); }} className={`block truncate rounded-md border px-2 py-1 text-[10px] font-medium ${statusClass(post.status)}`} title={post.title}>{format(parseISO(post.scheduled_for), "HH:mm")} · {post.title}</span>
                      ))}
                      {dayPosts.length > 3 && <span className="block text-[10px] text-muted-foreground">+{dayPosts.length - 3} conteúdos</span>}
                    </div>
                  </button>
                );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5">
            <div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Sparkles className="h-5 w-5" /></div><div><h3 className="font-semibold">Melhores horários</h3><p className="text-[11px] text-muted-foreground">Pontos de partida para testar.</p></div></div>
            <div className="space-y-3">
              {BEST_TIMES.map((item) => <div key={item.platform} className="rounded-xl border border-border bg-white/[.018] p-3"><div className="text-xs font-semibold">{item.platform}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.days}</div><div className="mt-1 flex items-center gap-1.5 text-xs text-primary"><Clock3 className="h-3.5 w-3.5" /> {item.times}</div></div>)}
            </div>
          </section>

          <section className="panel p-5">
            <h3 className="font-semibold">Próximas postagens</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">O que você separou para publicar.</p>
            <div className="mt-4 space-y-3">
              {upcoming.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">Nenhuma postagem futura neste período.</p> : upcoming.map((post) => (
                <button key={post.id} onClick={() => openEdit(post)} className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left hover:border-primary/35 hover:bg-primary/[.035]">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><CalendarDays className="h-4 w-4" /></div>
                  <div className="min-w-0"><div className="truncate text-xs font-semibold">{post.title}</div><div className="mt-1 text-[10px] text-muted-foreground">{format(parseISO(post.scheduled_for), "dd/MM · HH:mm")} · {post.platform}</div>{post.project_id && <div className="mt-1 truncate text-[10px] text-primary/80">{projectName(post.project_id)}</div>}</div>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
          <form onSubmit={submit} className="panel max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-7">
            <div className="mb-6 flex items-start justify-between"><div><div className="eyebrow">Agenda pessoal</div><h2 className="section-title mt-1 text-2xl">{editing ? "Editar postagem" : "Agendar postagem"}</h2></div><button type="button" onClick={() => setEditorOpen(false)} className="rounded-xl border border-border p-2"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Título" wide><input className="app-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Carrossel da campanha de lançamento" required /></Field>
              <Field label="Plataforma"><select className="app-input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as FormState["platform"] })}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="tiktok">TikTok</option><option value="outro">Outro</option></select></Field>
              <Field label="Formato"><select className="app-input" value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value as FormState["contentType"] })}><option value="carrossel">Carrossel</option><option value="cartaz">Cartaz</option><option value="reel">Reel</option><option value="story">Story</option><option value="post">Post</option><option value="outro">Outro</option></select></Field>
              <Field label="Data"><input type="date" className="app-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
              <Field label="Horário"><input type="time" className="app-input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required /></Field>
              <Field label="Status"><select className="app-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}><option value="rascunho">Rascunho</option><option value="agendado">Agendado</option><option value="publicado">Publicado</option></select></Field>
              <Field label="Conteúdo separado para postar"><select className="app-input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}><option value="">Sem projeto vinculado</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.type}</option>)}</select></Field>
              <Field label="Marca"><select className="app-input" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}><option value="">Brand Kit principal</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.is_primary ? " · principal" : ""}</option>)}</select></Field>
              <Field label="Legenda" wide><textarea className="app-input min-h-28 resize-y" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Legenda preparada para o dia da postagem" /></Field>
              <Field label="Observações" wide><textarea className="app-input min-h-20 resize-y" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="CTA, aprovação, cliente, arquivos pendentes..." /></Field>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {editing ? <button type="button" onClick={() => void doDelete(editing)} className="secondary-button text-red-300"><Trash2 className="h-4 w-4" /> Excluir</button> : <span />}
              <div className="flex gap-3"><button type="button" onClick={() => setEditorOpen(false)} className="secondary-button">Cancelar</button><button disabled={saving} className="primary-button disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Check className="h-4 w-4" />} {editing ? "Salvar mudanças" : "Adicionar à agenda"}</button></div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-semibold">{label}</span>{children}</label>;
}

function statusClass(status: string) {
  if (status === "publicado") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (status === "rascunho") return "border-amber-400/20 bg-amber-500/10 text-amber-300";
  return "border-primary/25 bg-primary/10 text-primary";
}
