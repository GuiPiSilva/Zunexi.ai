import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FolderHeart,
  Images,
  Plus,
  Save,
  Sparkles,
  Layers3,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Editor, type EditorHandle } from "@/components/Editor";
import {
  addLibrary,
  duplicateProject,
  getProject,
  upsertProject,
  type Project,
  type Slide,
} from "@/lib/storage";

export const Route = createFileRoute("/editor/$id")({
  head: () => ({ meta: [{ title: "Editor visual — Zunexi.ai" }] }),
  component: EditorPage,
});

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "projeto";
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

function EditorPage() {
  const { id } = useParams({ from: "/editor/$id" });
  const nav = useNavigate();
  const editorRef = useRef<EditorHandle>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState(true);
  const [exportingAll, setExportingAll] = useState(false);

  useEffect(() => {
    const current = getProject(id);
    if (!current) {
      toast.error("Projeto não encontrado.");
      nav({ to: "/projetos", replace: true });
      return;
    }
    setProject(current);
  }, [id, nav]);

  const slide = project?.slides[active];
  const editorKey = useMemo(() => `${id}-${active}`, [active, id]);

  if (!project || !slide) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
          Carregando editor...
        </div>
      </AppShell>
    );
  }

  function commit(next: Project) {
    setProject(next);
    upsertProject(next);
    setSaved(true);
  }

  function updateSlide(canvas: unknown, thumb: string) {
    const slides = project.slides.slice();
    slides[active] = { ...slides[active], canvas, thumb };
    setSaved(false);
    commit({ ...project, slides });
  }

  function addSlide() {
    const base: Slide = {
      id: crypto.randomUUID(),
      width: slide.width,
      height: slide.height,
      canvas: { elements: [], background: "#111424" },
    };
    const next = { ...project, slides: [...project.slides, base] };
    commit(next);
    setActive(next.slides.length - 1);
  }

  function duplicateSlide() {
    const copy: Slide = {
      ...slide,
      id: crypto.randomUUID(),
      canvas: JSON.parse(JSON.stringify(slide.canvas)),
    };
    const slides = [...project.slides];
    slides.splice(active + 1, 0, copy);
    commit({ ...project, slides });
    setActive(active + 1);
    toast.success("Página duplicada.");
  }

  function deleteSlide() {
    if (project.slides.length <= 1) {
      toast.error("O projeto precisa ter pelo menos uma página.");
      return;
    }
    const slides = project.slides.filter((_, index) => index !== active);
    commit({ ...project, slides });
    setActive(Math.max(0, active - 1));
    toast.success("Página excluída.");
  }

  function exportCurrent(multiplier = 1) {
    const filename = `${safeFileName(project.name)}-${String(active + 1).padStart(2, "0")}.png`;
    const result = editorRef.current?.exportPng(filename, multiplier);
    if (!result) toast.error("Não foi possível exportar esta página.");
  }

  async function exportCurrentPsd() {
    const filename = `${safeFileName(project.name)}-${String(active + 1).padStart(2, "0")}.psd`;
    try {
      const result = await editorRef.current?.exportPsd(filename);
      if (!result) toast.error("Não foi possível exportar o PSD desta página.");
      else toast.success("PSD gerado com as camadas do editor.");
    } catch (error) {
      console.error("Falha ao exportar PSD", error);
      toast.error("Não foi possível gerar o PSD.");
    }
  }

  async function exportAll() {
    if (exportingAll) return;
    setExportingAll(true);
    toast.info("Baixando todas as páginas...");

    try {
      for (let index = 0; index < project.slides.length; index += 1) {
        const item = project.slides[index];
        if (!item.thumb) continue;
        downloadDataUrl(
          item.thumb,
          `${safeFileName(project.name)}-${String(index + 1).padStart(2, "0")}.png`,
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      toast.success("Download das páginas iniciado.");
    } finally {
      setExportingAll(false);
    }
  }

  function saveToLibrary() {
    const dataUrl = editorRef.current?.getDataUrl(1) || slide.thumb;
    if (!dataUrl) {
      toast.error("Não foi possível salvar esta arte na biblioteca.");
      return;
    }
    addLibrary({
      id: crypto.randomUUID(),
      url: dataUrl,
      name: `${project.name} — página ${active + 1}`,
      addedAt: Date.now(),
    });
    toast.success("Arte salva na biblioteca.");
  }

  function duplicateWholeProject() {
    const copy = duplicateProject(project.id);
    if (!copy) {
      toast.error("Não foi possível duplicar o projeto.");
      return;
    }
    toast.success("Nova versão criada.");
    nav({ to: "/editor/$id", params: { id: copy.id } });
  }

  async function copyCaption() {
    const caption = project.meta?.theme?.trim();
    if (!caption) {
      toast.error("Este projeto ainda não possui uma legenda salva.");
      return;
    }
    await navigator.clipboard.writeText(caption);
    toast.success("Legenda copiada.");
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100dvh-76px)] min-h-0 flex-col overflow-hidden bg-[#080b14]">
        <header className="flex min-h-[66px] shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card/90 px-3 py-2 sm:px-5">
          <Link
            to="/projetos"
            className="rounded-xl p-2 text-muted-foreground hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="min-w-[180px] flex-1">
            <div className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">
              {project.type}
            </div>
            <input
              value={project.name}
              onChange={(event) => {
                setSaved(false);
                setProject({ ...project, name: event.target.value });
              }}
              onBlur={() => commit(project)}
              className="w-full truncate bg-transparent text-sm font-semibold outline-none sm:text-base"
            />
          </div>

          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" /> Salvo automaticamente
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Salvando...
              </>
            )}
          </div>

          <button onClick={() => commit(project)} className="secondary-button px-3 py-2 text-xs">
            <Save className="h-3.5 w-3.5" /> Salvar
          </button>
          <button onClick={() => exportCurrent(2)} className="primary-button px-3 py-2 text-xs">
            <Download className="h-3.5 w-3.5" /> Baixar HD
          </button>
        </header>

        <section className="shrink-0 border-b border-border bg-[#0b0e19] px-3 py-3 sm:px-5">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportCurrent(1)} className="secondary-button px-3 py-2 text-xs">
              <Download className="h-4 w-4" /> Baixar PNG
            </button>
            <button onClick={() => void exportCurrentPsd()} className="secondary-button px-3 py-2 text-xs">
              <Layers3 className="h-4 w-4" /> Baixar PSD
            </button>
            {project.type === "carrossel" && (
              <button onClick={exportAll} disabled={exportingAll} className="secondary-button px-3 py-2 text-xs disabled:opacity-50">
                <Images className="h-4 w-4" /> {exportingAll ? "Baixando..." : "Baixar todas"}
              </button>
            )}
            <button onClick={duplicateWholeProject} className="secondary-button px-3 py-2 text-xs">
              <Sparkles className="h-4 w-4" /> Criar outra versão
            </button>
            <button onClick={saveToLibrary} className="secondary-button px-3 py-2 text-xs">
              <FolderHeart className="h-4 w-4" /> Salvar na biblioteca
            </button>
            <button onClick={copyCaption} className="secondary-button px-3 py-2 text-xs">
              <Copy className="h-4 w-4" /> Copiar legenda
            </button>
            <Link to="/projetos" className="secondary-button px-3 py-2 text-xs">
              Voltar aos projetos
            </Link>
          </div>
        </section>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {project.type === "carrossel" && (
            <aside className="hidden w-40 shrink-0 flex-col border-r border-border bg-[#0b0e19] md:flex">
              <div className="flex items-center justify-between border-b border-border px-3 py-3">
                <span className="text-xs font-semibold">Páginas</span>
                <button onClick={addSlide} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white">
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {project.slides.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => setActive(index)}
                    className={`relative aspect-square w-full overflow-hidden rounded-xl border-2 bg-secondary ${
                      active === index
                        ? "border-primary shadow-[0_0_0_3px_rgba(139,92,246,.12)]"
                        : "border-transparent hover:border-border"
                    }`}
                  >
                    {item.thumb ? (
                      <img src={item.thumb} alt={`Página ${index + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] text-white">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </button>
                ))}
                <button onClick={addSlide} className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
                <button onClick={duplicateSlide} title="Duplicar página" className="secondary-button px-2 py-2">
                  <Copy className="h-4 w-4" />
                </button>
                <button onClick={deleteSlide} title="Excluir página" className="inline-flex items-center justify-center rounded-xl border border-destructive/25 bg-destructive/8 p-2 text-destructive hover:bg-destructive/15">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </aside>
          )}

          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <Editor
              ref={editorRef}
              key={editorKey}
              width={slide.width}
              height={slide.height}
              initial={slide.canvas as never}
              onChange={updateSlide}
            />
          </div>
        </div>

        {project.type === "carrossel" && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-border bg-card p-2 md:hidden">
            {project.slides.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setActive(index)}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-secondary ${
                  active === index ? "border-primary" : "border-transparent"
                }`}
              >
                {item.thumb ? (
                  <img src={item.thumb} alt={`Página ${index + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-xs text-muted-foreground">{index + 1}</span>
                )}
              </button>
            ))}
            <button onClick={addSlide} className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-border">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
