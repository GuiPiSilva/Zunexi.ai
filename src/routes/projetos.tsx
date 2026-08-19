import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Images,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { deleteProject, duplicateProject, loadProjects, subscribeProjects, upsertProject, type Project } from "@/lib/storage";

export const Route = createFileRoute("/projetos")({
  head: () => ({ meta: [{ title: "Meus projetos — Zunexi.ai" }] }),
  component: MeusProjetos,
});

type Filter = "todos" | "carrossel" | "cartaz";

function MeusProjetos() {
  const [items, setItems] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [order, setOrder] = useState<"recentes" | "antigos" | "nome">("recentes");
  const nav = useNavigate();

  const refresh = () => setItems(loadProjects());
  useEffect(() => {
    refresh();
    return subscribeProjects(refresh);
  }, []);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    const result = items.filter((project) => {
      const matchesText = !value || project.name.toLowerCase().includes(value);
      const matchesType = filter === "todos" || project.type === filter;
      return matchesText && matchesType;
    });
    return result.sort((a, b) => {
      if (order === "nome") return a.name.localeCompare(b.name, "pt-BR");
      return order === "recentes" ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt;
    });
  }, [filter, items, order, query]);

  return (
    <AppShell>
      <div className="page-wrap space-y-7 pb-16">
        <section className="panel relative overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_85%_0%,rgba(139,92,246,.14),transparent_28%)] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="eyebrow mb-3 flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5 text-primary" /> Workspace criativo</div>
              <h1 className="section-title text-3xl sm:text-5xl">Meus projetos</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Organize, duplique, renomeie, exclua e continue qualquer criação sem perder o histórico.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/cartaz" className="secondary-button"><ImagePlus className="h-4 w-4" /> Novo cartaz</Link>
              <Link to="/carrossel" className="primary-button"><Plus className="h-4 w-4" /> Novo carrossel</Link>
            </div>
          </div>
        </section>

        <section className="panel p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projetos..." className="w-full bg-transparent text-sm outline-none" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["todos", "carrossel", "cartaz"] as Filter[]).map((item) => (
                <button key={item} onClick={() => setFilter(item)} className={`rounded-xl border px-4 py-2.5 text-sm font-medium capitalize ${filter === item ? "border-primary/45 bg-primary/15 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                  {item === "todos" ? "Todos" : item === "carrossel" ? "Carrosséis" : "Cartazes"}
                </button>
              ))}
            </div>
            <select value={order} onChange={(event) => setOrder(event.target.value as typeof order)} className="app-input w-full xl:w-44">
              <option value="recentes">Mais recentes</option>
              <option value="antigos">Mais antigos</option>
              <option value="nome">Nome A–Z</option>
            </select>
          </div>
        </section>

        {visible.length === 0 ? (
          <section className="panel flex min-h-[360px] flex-col items-center justify-center border-dashed p-8 text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary"><FolderOpen className="h-7 w-7" /></div>
            <h2 className="section-title text-xl">Nenhum projeto encontrado</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">Crie seu primeiro conteúdo ou altere os filtros de busca.</p>
            <Link to="/carrossel" className="primary-button mt-5">Criar projeto</Link>
          </section>
        ) : (
          <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((project) => (
              <article key={project.id} className="panel group overflow-hidden">
                <button type="button" onClick={() => nav({ to: "/editor/$id", params: { id: project.id } })} className="relative block aspect-[4/3] w-full overflow-hidden bg-secondary text-left">
                  {project.slides[0]?.thumb ? (
                    <img src={project.slides[0].thumb} alt={project.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,.35),transparent_40%),linear-gradient(135deg,#18112e,#07101f)]">
                      {project.type === "carrossel" ? <Images className="h-10 w-10 text-primary" /> : <ImagePlus className="h-10 w-10 text-accent" />}
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md">{project.type}</span>
                </button>

                <div className="p-4">
                  <h2 className="truncate font-semibold">{project.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Atualizado em {new Date(project.updatedAt).toLocaleDateString("pt-BR")} · {project.slides.length} {project.slides.length === 1 ? "página" : "páginas"}</p>
                  <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-4">
                    <ProjectAction label="Abrir" icon={ExternalLink} onClick={() => nav({ to: "/editor/$id", params: { id: project.id } })} />
                    <ProjectAction label="Duplicar" icon={Copy} onClick={() => { if (duplicateProject(project.id)) { toast.success("Projeto duplicado."); refresh(); } }} />
                    <ProjectAction label="Renomear" icon={Pencil} onClick={() => { const nextName = prompt("Novo nome do projeto:", project.name)?.trim(); if (nextName && nextName !== project.name) { upsertProject({ ...project, name: nextName }); toast.success("Projeto renomeado."); refresh(); } }} />
                    <ProjectAction danger label="Excluir" icon={Trash2} onClick={() => { if (confirm(`Excluir “${project.name}”?`)) { deleteProject(project.id); refresh(); toast.success("Projeto excluído."); } }} />
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Mostrando {visible.length} de {items.length} projetos</span>
          <span>Projetos sincronizados por usuário quando a nuvem está disponível.</span>
        </div>
      </div>
    </AppShell>
  );
}

function ProjectAction({ label, icon: Icon, onClick, danger = false }: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] ${danger ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
      <Icon className="h-4 w-4" /><span className="truncate">{label}</span>
    </button>
  );
}
