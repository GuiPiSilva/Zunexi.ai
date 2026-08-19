import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, FileText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AgencySectionNav } from "@/components/agency/AgencySectionNav";
import { AGENCY_MODULES, getAgencyModule, type AgencyModuleId } from "@/lib/agency-catalog";
import { deleteAgencyWorkflow, listAgencyWorkflows } from "@/lib/agency.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/agencia/historico")({
  head: () => ({ meta: [{ title: "Histórico — Agência 360 — Zunexi.ai" }] }),
  component: AgencyHistory,
});

type Workflow = { id: string; module: AgencyModuleId; title: string; summary: string; created_at: string; project_id?: string | null };

function AgencyHistory() {
  const listFn = useServerFn(listAgencyWorkflows);
  const deleteFn = useServerFn(deleteAgencyWorkflow);
  const [items, setItems] = useState<Workflow[]>([]);
  const [query, setQuery] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() { const accessKey = getAccessKey(); if (!accessKey) return; const rows = await listFn({ data: { accessKey } }); setItems(rows as Workflow[]); }
  useEffect(() => { refresh().catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar o histórico.")).finally(() => setLoading(false)); }, []);

  const visible = useMemo(() => { const value = query.trim().toLowerCase(); return items.filter((item) => (!moduleId || item.module === moduleId) && (!value || `${item.title} ${item.summary} ${getAgencyModule(item.module).name}`.toLowerCase().includes(value))); }, [items, moduleId, query]);

  async function remove(item: Workflow) { const accessKey = getAccessKey(); if (!accessKey || !confirm(`Excluir o plano “${item.title}” e as tarefas ligadas a ele?`)) return; try { await deleteFn({ data: { accessKey, id: item.id } }); setItems((current) => current.filter((row) => row.id !== item.id)); toast.success("Plano excluído."); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir."); } }

  return <AppShell><div className="page-wrap space-y-6 pb-16">
    <AgencySectionNav />
    <section><div className="eyebrow mb-2 flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-primary" /> Memória estratégica</div><h1 className="section-title text-3xl sm:text-4xl">Histórico de planos</h1><p className="mt-2 text-sm text-muted-foreground">Tudo o que a IA da agência já produziu, separado por serviço.</p></section>
    <section className="panel p-4"><div className="grid gap-3 md:grid-cols-[1fr_280px]"><div className="flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar plano..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div><select value={moduleId} onChange={(event) => setModuleId(event.target.value)} className="app-input"><option value="">Todos os serviços</option>{AGENCY_MODULES.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}</select></div></section>
    {loading ? <div className="panel grid min-h-64 place-items-center text-sm text-muted-foreground">Carregando histórico...</div> : visible.length === 0 ? <div className="panel flex min-h-64 flex-col items-center justify-center p-8 text-center"><FileText className="h-8 w-8 text-primary" /><h2 className="section-title mt-4 text-xl">Nenhum plano encontrado</h2><p className="mt-2 text-sm text-muted-foreground">Abra uma função da Agência 360 e gere o primeiro plano.</p><Link to="/agencia" className="primary-button mt-5">Escolher serviço</Link></div> : <section className="space-y-3">{visible.map((item) => { const module = getAgencyModule(item.module); return <article key={item.id} className="panel p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-primary">{module.category}</span><span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</span></div><h2 className="section-title mt-3 text-lg">{item.title}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{item.summary || "Plano gerado pela Zunexi.ai."}</p></div><div className="flex shrink-0 gap-2"><Link to="/agencia/$modulo" params={{ modulo: module.slug }} className="secondary-button">Abrir {module.shortName} <ArrowRight className="h-4 w-4" /></Link><button onClick={() => remove(item)} className="secondary-button text-red-500 dark:text-red-300" title="Excluir"><Trash2 className="h-4 w-4" /></button></div></div></article>; })}</section>}
  </div></AppShell>;
}
