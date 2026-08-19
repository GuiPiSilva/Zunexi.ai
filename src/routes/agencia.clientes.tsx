import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Globe2, Pencil, Plus, RefreshCcw, Search, Target, Trash2, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AgencySectionNav } from "@/components/agency/AgencySectionNav";
import { deleteAgencyProject, listAgencyProjects, saveAgencyProject } from "@/lib/agency.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/agencia/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Agência 360 — Zunexi.ai" }] }),
  component: AgencyClients,
});

type ProjectStatus = "active" | "paused" | "completed" | "archived";
type AgencyProject = {
  id: string;
  name: string;
  objective: string;
  audience: string;
  channels: string;
  budget: string;
  website: string;
  status: ProjectStatus;
  brand_profile_id?: string | null;
  brand_profiles?: { name?: string } | null;
};

const EMPTY_FORM = { name: "", objective: "", audience: "", channels: "", budget: "", website: "", status: "active" as ProjectStatus };

function AgencyClients() {
  const listFn = useServerFn(listAgencyProjects);
  const saveFn = useServerFn(saveAgencyProject);
  const deleteFn = useServerFn(deleteAgencyProject);
  const [items, setItems] = useState<AgencyProject[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AgencyProject | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function refresh() {
    const accessKey = getAccessKey();
    if (!accessKey) return;
    const rows = await listFn({ data: { accessKey } });
    setItems(rows as AgencyProject[]);
  }

  useEffect(() => {
    refresh().catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar os clientes.")).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return items.filter((item) => !value || `${item.name} ${item.objective} ${item.audience} ${item.channels}`.toLowerCase().includes(value));
  }, [items, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(project: AgencyProject) {
    setEditing(project);
    setForm({ name: project.name, objective: project.objective || "", audience: project.audience || "", channels: project.channels || "", budget: project.budget || "", website: project.website || "", status: project.status });
    setModalOpen(true);
  }

  async function save() {
    const accessKey = getAccessKey();
    if (!accessKey || form.name.trim().length < 2) { toast.error("Informe o nome do cliente/projeto."); return; }
    setSaving(true);
    try {
      await saveFn({ data: { accessKey, project: { id: editing?.id || null, brandId: editing?.brand_profile_id || null, ...form } } });
      await refresh();
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      toast.success(editing ? "Cliente atualizado." : "Cliente criado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o cliente.");
    } finally { setSaving(false); }
  }

  async function remove(project: AgencyProject) {
    const accessKey = getAccessKey();
    if (!accessKey || !confirm(`Excluir “${project.name}” e todos os planos/tarefas vinculados?`)) return;
    try {
      await deleteFn({ data: { accessKey, id: project.id } });
      setItems((current) => current.filter((item) => item.id !== project.id));
      toast.success("Cliente excluído.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir."); }
  }

  return (
    <AppShell>
      <div className="page-wrap space-y-6 pb-16">
        <AgencySectionNav />
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="eyebrow mb-2 flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-primary" /> Carteira da agência</div><h1 className="section-title text-3xl sm:text-4xl">Clientes e projetos</h1><p className="mt-2 text-sm text-muted-foreground">Centralize o contexto de cada empresa antes de abrir qualquer serviço.</p></div>
          <button onClick={openCreate} className="primary-button"><Plus className="h-4 w-4" /> Novo cliente</button>
        </section>

        <section className="panel p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, objetivo ou canal..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div><button onClick={() => refresh().catch(() => undefined)} className="secondary-button"><RefreshCcw className="h-4 w-4" /> Atualizar</button></div>
        </section>

        {loading ? <div className="panel grid min-h-64 place-items-center text-sm text-muted-foreground">Carregando clientes...</div> : visible.length === 0 ? (
          <section className="panel flex min-h-72 flex-col items-center justify-center border-dashed p-8 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 text-primary"><Building2 className="h-6 w-6" /></div><h2 className="section-title mt-4 text-xl">Nenhum cliente encontrado</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Cadastre uma empresa para que todos os serviços da Agência 360 usem o mesmo contexto.</p><button onClick={openCreate} className="primary-button mt-5"><Plus className="h-4 w-4" /> Cadastrar cliente</button></section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((project) => (
              <article key={project.id} className="panel p-5">
                <div className="flex items-start justify-between gap-4"><div className="min-w-0"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] ${project.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-secondary text-muted-foreground"}`}>{project.status === "active" ? "Ativo" : project.status === "paused" ? "Pausado" : project.status === "completed" ? "Concluído" : "Arquivado"}</span><h2 className="section-title mt-3 truncate text-xl">{project.name}</h2>{project.brand_profiles?.name && <p className="mt-1 text-xs text-primary">Brand Kit: {project.brand_profiles.name}</p>}</div><div className="flex gap-1"><button onClick={() => openEdit(project)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => remove(project)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400" title="Excluir"><Trash2 className="h-4 w-4" /></button></div></div>
                <div className="mt-5 space-y-3"><Info icon={Target} label="Objetivo" value={project.objective || "Não informado"} /><Info icon={UsersRound} label="Público" value={project.audience || "Não informado"} /><Info icon={Globe2} label="Canais" value={project.channels || "Não informados"} /></div>
                <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4"><span className="text-xs text-muted-foreground">{project.budget ? `Orçamento: ${project.budget}` : "Sem orçamento informado"}</span><Link to="/agencia" className="flex items-center gap-1 text-xs font-semibold text-primary">Abrir serviços <ArrowRight className="h-3.5 w-3.5" /></Link></div>
              </article>
            ))}
          </section>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
            <div className="panel max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><div className="eyebrow">Cadastro da agência</div><h2 className="section-title mt-2 text-2xl">{editing ? "Editar cliente" : "Novo cliente"}</h2></div><button onClick={() => !saving && setModalOpen(false)} className="rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-5 w-5" /></button></div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Nome do cliente/projeto" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Ex.: Hamburgueria Central" /><Field label="Site" value={form.website} onChange={(value) => setForm((current) => ({ ...current, website: value }))} placeholder="https://..." /><Field label="Objetivo principal" value={form.objective} onChange={(value) => setForm((current) => ({ ...current, objective: value }))} placeholder="Aumentar vendas, gerar demanda..." /><Field label="Público-alvo" value={form.audience} onChange={(value) => setForm((current) => ({ ...current, audience: value }))} placeholder="Quem queremos atingir?" /><Field label="Canais atuais" value={form.channels} onChange={(value) => setForm((current) => ({ ...current, channels: value }))} placeholder="Instagram, Google, LinkedIn..." /><Field label="Orçamento" value={form.budget} onChange={(value) => setForm((current) => ({ ...current, budget: value }))} placeholder="Ex.: R$ 5.000/mês" /></div>
              <label className="mt-4 block text-xs font-semibold text-muted-foreground">Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProjectStatus }))} className="app-input mt-2"><option value="active">Ativo</option><option value="paused">Pausado</option><option value="completed">Concluído</option><option value="archived">Arquivado</option></select></label>
              <div className="mt-6 flex justify-end gap-2"><button onClick={() => setModalOpen(false)} disabled={saving} className="secondary-button">Cancelar</button><button onClick={save} disabled={saving} className="primary-button">{saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar cliente"}</button></div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Info({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) { return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-1 line-clamp-2 text-sm">{value}</div></div></div>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="block text-xs font-semibold text-muted-foreground">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="app-input mt-2" /></label>; }
