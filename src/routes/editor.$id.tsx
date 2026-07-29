import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Download, Images, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { renderElementsThumbnail } from "@/lib/fabric-elements";
import { duplicateProject, getProject, type Project } from "@/lib/storage";
import type { ElementDesc } from "@/lib/layouts";

export const Route = createFileRoute("/editor/$id")({
  head: () => ({ meta: [{ title: "Arte pronta — Zunexi.ai" }] }),
  component: ProjectPreviewPage,
});

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "zunexi";
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

type GeneratedCanvas = {
  elements?: ElementDesc[];
  background?: string;
};

async function renderFinalSlide(slide: Project["slides"][number]) {
  const canvasData = (slide.canvas || {}) as GeneratedCanvas;
  if (Array.isArray(canvasData.elements) && canvasData.elements.length > 0) {
    return renderElementsThumbnail({
      elements: canvasData.elements,
      background: canvasData.background || "#050505",
      width: slide.width,
      height: slide.height,
      maxDimension: Math.max(slide.width, slide.height),
      format: "png",
      quality: 1,
    });
  }
  return slide.thumb;
}

function ProjectPreviewPage() {
  const { id } = useParams({ from: "/editor/$id" });
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState<string | undefined>();
  const [rendering, setRendering] = useState(false);
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
  const canvasData = useMemo(() => (slide?.canvas || {}) as GeneratedCanvas, [slide]);

  useEffect(() => {
    let cancelled = false;
    async function renderFinal() {
      if (!slide) return;
      setRendering(true);
      try {
        const image = await renderFinalSlide(slide);
        if (!cancelled) setPreview(image || slide.thumb);
      } catch (error) {
        console.error("Falha ao montar arte final", error);
        if (!cancelled) setPreview(slide.thumb);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }
    void renderFinal();
    return () => { cancelled = true; };
  }, [canvasData, slide]);

  if (!project || !slide) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }

  function downloadCurrent() {
    const source = preview || slide.thumb;
    if (!source) {
      toast.error("A arte ainda não ficou pronta para download.");
      return;
    }
    downloadDataUrl(source, `${safeFileName(project.name)}-${String(active + 1).padStart(2, "0")}.png`);
  }

  async function downloadAll() {
    if (project.slides.length < 2 || exportingAll) return;
    setExportingAll(true);
    try {
      let exported = 0;
      for (let index = 0; index < project.slides.length; index += 1) {
        const item = project.slides[index];
        const source = await renderFinalSlide(item);
        if (!source) continue;
        downloadDataUrl(source, `${safeFileName(project.name)}-${String(index + 1).padStart(2, "0")}.png`);
        exported += 1;
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
      if (exported === project.slides.length) toast.success(`${exported} artes preparadas para download.`);
      else toast.warning(`${exported} de ${project.slides.length} artes puderam ser preparadas.`);
    } catch (error) {
      console.error("Falha ao exportar carrossel", error);
      toast.error("Não foi possível preparar todas as artes para download.");
    } finally {
      setExportingAll(false);
    }
  }

  async function duplicateWholeProject() {
    const copy = duplicateProject(project.id);
    if (!copy) {
      toast.error("Não foi possível duplicar o projeto.");
      return;
    }
    toast.success("Projeto duplicado.");
    nav({ to: "/editor/$id", params: { id: copy.id } });
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
        <section className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/projetos" className="secondary-button px-3" title="Voltar aos projetos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="eyebrow">Arte final · editor temporariamente desativado</div>
              <h1 className="truncate text-lg font-semibold sm:text-xl">{project.name}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                O texto já está aplicado à composição. Aqui você apenas visualiza e baixa a arte final.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={duplicateWholeProject} className="secondary-button">
              <Copy className="h-4 w-4" /> Duplicar
            </button>
            {project.slides.length > 1 && (
              <button type="button" onClick={downloadAll} disabled={exportingAll} className="secondary-button disabled:opacity-60">
                {exportingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
                {exportingAll ? "Preparando..." : "Baixar todas"}
              </button>
            )}
            <button type="button" onClick={downloadCurrent} disabled={rendering} className="primary-button disabled:opacity-60">
              {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {rendering ? "Preparando..." : "Baixar PNG"}
            </button>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[150px_minmax(0,1fr)]">
          {project.slides.length > 1 && (
            <aside className="panel p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Images className="h-4 w-4" /> Páginas
              </div>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                {project.slides.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActive(index)}
                    className={`relative overflow-hidden rounded-lg border-2 bg-secondary ${active === index ? "border-primary" : "border-transparent hover:border-border"}`}
                  >
                    {item.thumb ? <img src={item.thumb} alt={`Página ${index + 1}`} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-xs">{index + 1}</div>}
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">{index + 1}</span>
                  </button>
                ))}
              </div>
            </aside>
          )}

          <section className="panel min-w-0 overflow-hidden p-3 sm:p-5">
            <div className="mx-auto flex min-h-[55vh] max-w-4xl items-center justify-center rounded-xl bg-[#111] p-3 sm:p-6">
              {rendering && !preview ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Montando arte final...</div>
              ) : preview ? (
                <img src={preview} alt={`Arte ${active + 1}`} className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-2xl" />
              ) : (
                <div className="text-sm text-muted-foreground">Prévia indisponível.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
