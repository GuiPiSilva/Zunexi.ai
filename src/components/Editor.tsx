import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import type { ElementDesc } from "@/lib/layouts";
import { Type, Image as ImageIcon, Square, Circle as CircleIcon, Trash2, Copy, Undo2, Redo2, Download, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Layers3 } from "lucide-react";
import { exportFabricCanvasToPsd } from "@/lib/psd-export";
import { addElementDescToCanvas, loadFabricImage, normalizeCanvasJson } from "@/lib/fabric-elements";

export interface EditorHandle {
  exportPng: (filename?: string, multiplier?: number) => string | null;
  exportPsd: (filename?: string) => Promise<boolean>;
  getDataUrl: (multiplier?: number) => string | null;
}

interface EditorProps {
  width: number;
  height: number;
  initial?: { elements: ElementDesc[]; background: string; fonts?: { display: string; body: string } } | fabric.Canvas | any;
  onChange?: (json: unknown, thumb: string) => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ width, height, initial, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fcRef = useRef<fabric.Canvas | null>(null);
  const [sel, setSel] = useState<fabric.FabricObject | null>(null);
  const [zoom, setZoom] = useState(1);
  const history = useRef<string[]>([]);
  const historyIdx = useRef(-1);
  const skipHistory = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    getDataUrl(multiplier = 1) {
      const canvas = fcRef.current;
      if (!canvas) return null;
      return canvas.toDataURL({ format: "png", multiplier });
    },
    exportPng(filename = "post.png", multiplier = 1) {
      const canvas = fcRef.current;
      if (!canvas) return null;
      const dataUrl = canvas.toDataURL({ format: "png", multiplier });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = filename;
      anchor.click();
      return dataUrl;
    },
    async exportPsd(filename = "zunexi-design.psd") {
      const canvas = fcRef.current;
      if (!canvas) return false;
      return exportFabricCanvasToPsd(canvas, filename);
    },
  }), []);

  const emit = useCallback(() => {
    const c = fcRef.current; if (!c) return;
    const json = serializeCanvas(c, width, height);
    const thumb = c.toDataURL({ format: "jpeg", quality: 0.72, multiplier: Math.min(0.36, 420 / Math.max(width, height)) });
    onChangeRef.current?.(json, thumb);
  }, [height, width]);

  const snapshot = useCallback(() => {
    const c = fcRef.current; if (!c || skipHistory.current) return;
    const json = JSON.stringify(serializeCanvas(c, width, height));
    history.current = history.current.slice(0, historyIdx.current + 1);
    history.current.push(json);
    historyIdx.current = history.current.length - 1;
    emit();
  }, [emit, height, width]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const c = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: "#111",
      preserveObjectStacking: true,
    });
    fcRef.current = c;
    skipHistory.current = true;
    let cancelled = false;

    const onSel = () => setSel(c.getActiveObject() || null);
    c.on("selection:created", onSel);
    c.on("selection:updated", onSel);
    c.on("selection:cleared", () => setSel(null));
    c.on("object:modified", snapshot);
    c.on("object:added", snapshot);
    c.on("object:removed", snapshot);

    async function loadInitial() {
      try {
        if (initial && "elements" in initial) {
          c.backgroundColor = initial.background || "#111";
          for (const el of initial.elements as ElementDesc[]) {
            await addElementDescToCanvas(c, el);
          }
        } else if (initial) {
          await c.loadFromJSON(prepareCanvasJson(initial, width, height));
        }

        if (cancelled) return;
        c.requestRenderAll();
        const json = JSON.stringify(serializeCanvas(c, width, height));
        history.current = [json];
        historyIdx.current = 0;
      } catch (error) {
        console.error("Falha ao carregar o projeto no editor", error);
      } finally {
        skipHistory.current = false;
      }
    }

    void loadInitial();

    return () => {
      cancelled = true;
      c.dispose();
      fcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  const viewportRef = useRef<HTMLDivElement>(null);

  // Ajusta apenas o tamanho CSS do Fabric. O backstore continua no tamanho
  // lógico do documento; assim coordenadas, seleção e exportação permanecem
  // idênticas independentemente do tamanho disponível na tela.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function fit() {
      const pw = el.clientWidth - 24;
      const ph = el.clientHeight - 24;
      if (pw <= 0 || ph <= 0) return;
      const z = Math.min(pw / width, ph / height, 1);
      setZoom(Math.max(0.05, z));
    }
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [width, height]);

  useEffect(() => {
    const canvas = fcRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: Math.round(width * zoom), height: Math.round(height * zoom) }, { cssOnly: true });
    canvas.calcOffset();
    canvas.requestRenderAll();
  }, [height, width, zoom]);

  function undo() {
    if (historyIdx.current <= 0) return;
    historyIdx.current--; restore();
  }
  function redo() {
    if (historyIdx.current >= history.current.length - 1) return;
    historyIdx.current++; restore();
  }
  async function restore() {
    const c = fcRef.current; if (!c) return;
    skipHistory.current = true;
    await c.loadFromJSON(JSON.parse(history.current[historyIdx.current]));
    c.renderAll();
    skipHistory.current = false;
    emit();
  }

  function addText() {
    const c = fcRef.current; if (!c) return;
    const t = new fabric.Textbox("Novo texto", { left: width/2 - 150, top: height/2, width: 300, fontSize: 48, fill: "#fff", fontFamily: "Inter", textAlign: "center" });
    c.add(t); c.setActiveObject(t); c.renderAll();
  }
  function addRect() {
    const c = fcRef.current; if (!c) return;
    const r = new fabric.Rect({ left: 100, top: 100, width: 200, height: 200, fill: "#a855f7" });
    c.add(r); c.setActiveObject(r); c.renderAll();
  }
  function addCircle() {
    const c = fcRef.current; if (!c) return;
    const r = new fabric.Circle({ left: 100, top: 100, radius: 100, fill: "#22d3ee" });
    c.add(r); c.setActiveObject(r); c.renderAll();
  }
  async function addImageUrl(url: string) {
    const c = fcRef.current; if (!c) return;
    const img = await loadFabricImage(url);
    const imageWidth = img.width || 1;
    const imageHeight = img.height || 1;
    const scale = Math.min((width * 0.6) / imageWidth, (height * 0.6) / imageHeight);
    img.set({
      left: width / 2 - (imageWidth * scale) / 2,
      top: height / 2 - (imageHeight * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    c.add(img); c.setActiveObject(img); c.requestRenderAll();
  }
  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => addImageUrl(r.result as string); r.readAsDataURL(f);
  }
  function del() { const c=fcRef.current; const o=c?.getActiveObject(); if(c&&o){ c.remove(o); c.renderAll(); }}
  function dup() {
    const c=fcRef.current; const o=c?.getActiveObject(); if(!c||!o) return;
    o.clone().then((cl: fabric.FabricObject) => { cl.set({ left: (o.left||0)+30, top: (o.top||0)+30 }); c.add(cl); c.setActiveObject(cl); c.renderAll(); });
  }
  function exportPng() {
    const c = fcRef.current; if (!c) return;
    const url = c.toDataURL({ format: "png", multiplier: 1 });
    const a = document.createElement("a"); a.href = url; a.download = "post.png"; a.click();
  }
  async function exportPsd() {
    const c = fcRef.current; if (!c) return;
    await exportFabricCanvasToPsd(c, "zunexi-design.psd");
  }

  const isText = sel instanceof fabric.Textbox;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 overflow-x-auto border-b border-border bg-card p-2">
        <ToolBtn onClick={addText} icon={Type} label="Texto"/>
        <ToolBtn onClick={()=>document.getElementById("editor-upload")?.click()} icon={ImageIcon} label="Imagem"/>
        <input id="editor-upload" type="file" accept="image/*" onChange={onUpload} className="hidden"/>
        <ToolBtn onClick={addRect} icon={Square} label="Retângulo"/>
        <ToolBtn onClick={addCircle} icon={CircleIcon} label="Círculo"/>
        <span className="w-px h-6 bg-border mx-1"/>
        <ToolBtn onClick={undo} icon={Undo2} label="Desfazer"/>
        <ToolBtn onClick={redo} icon={Redo2} label="Refazer"/>
        <span className="w-px h-6 bg-border mx-1"/>
        <ToolBtn onClick={dup} icon={Copy} label="Duplicar" disabled={!sel}/>
        <ToolBtn onClick={del} icon={Trash2} label="Excluir" disabled={!sel}/>
        <span className="w-px h-6 bg-border mx-1"/>
        <label className="flex items-center gap-1 text-xs px-1 cursor-pointer" title="Cor de fundo">
          <span className="hidden md:inline text-muted-foreground">Fundo</span>
          <input type="color" defaultValue={(fcRef.current?.backgroundColor as string) || "#111111"}
            onChange={e=>{ const c=fcRef.current; if(!c) return; c.backgroundColor = e.target.value; c.renderAll(); snapshot(); }}
            className="w-8 h-8 rounded cursor-pointer bg-transparent"/>
        </label>
        <span className="w-px h-6 bg-border mx-1"/>
        <ToolBtn onClick={exportPng} icon={Download} label="Exportar PNG"/>
        <ToolBtn onClick={() => void exportPsd()} icon={Layers3} label="Exportar PSD"/>

        {isText && sel && (
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <input type="color" defaultValue={(sel as fabric.Textbox).fill as string} onChange={e=>{ (sel as fabric.Textbox).set("fill", e.target.value); fcRef.current?.renderAll(); snapshot(); }} className="w-8 h-8 rounded"/>
            <input type="number" defaultValue={(sel as fabric.Textbox).fontSize} onChange={e=>{ (sel as fabric.Textbox).set("fontSize", +e.target.value); fcRef.current?.renderAll(); snapshot(); }} className="w-16 bg-input rounded p-1 text-xs"/>
            <button onClick={()=>{ const t=sel as fabric.Textbox; t.set("fontWeight", t.fontWeight==="bold"?"normal":"bold"); fcRef.current?.renderAll(); snapshot(); }} className="p-1.5 rounded hover:bg-secondary"><Bold className="w-4 h-4"/></button>
            <button onClick={()=>{ const t=sel as fabric.Textbox; t.set("fontStyle", t.fontStyle==="italic"?"normal":"italic"); fcRef.current?.renderAll(); snapshot(); }} className="p-1.5 rounded hover:bg-secondary"><Italic className="w-4 h-4"/></button>
            <button onClick={()=>{ (sel as fabric.Textbox).set("textAlign","left"); fcRef.current?.renderAll(); snapshot(); }} className="p-1.5 rounded hover:bg-secondary"><AlignLeft className="w-4 h-4"/></button>
            <button onClick={()=>{ (sel as fabric.Textbox).set("textAlign","center"); fcRef.current?.renderAll(); snapshot(); }} className="p-1.5 rounded hover:bg-secondary"><AlignCenter className="w-4 h-4"/></button>
            <button onClick={()=>{ (sel as fabric.Textbox).set("textAlign","right"); fcRef.current?.renderAll(); snapshot(); }} className="p-1.5 rounded hover:bg-secondary"><AlignRight className="w-4 h-4"/></button>
          </div>
        )}
        {sel && !isText && (
          <div className="flex items-center gap-1 ml-auto">
            <input type="color" defaultValue={(sel as any).fill as string || "#fff"} onChange={e=>{ (sel as any).set("fill", e.target.value); fcRef.current?.renderAll(); snapshot(); }} className="w-8 h-8 rounded"/>
          </div>
        )}
      </div>

      {sel && (
        <div className="px-3 py-1 text-[11px] text-muted-foreground bg-card/50 border-b border-border">
          Dica: arraste para mover • cantos para redimensionar • duplo clique no texto para editar
        </div>
      )}

      {/* Canvas viewport */}
      <div ref={viewportRef} className="grid min-h-0 flex-1 place-items-center overflow-auto bg-background p-3">
        <div style={{ width: width * zoom, height: height * zoom }} className="relative shrink-0 shadow-2xl">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
});

function ToolBtn({ icon: Icon, label, onClick, disabled }: { icon: React.ComponentType<{className?:string}>; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} className="p-2 rounded hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-xs">
      <Icon className="w-4 h-4"/><span className="hidden md:inline">{label}</span>
    </button>
  );
}


function serializeCanvas(canvas: fabric.Canvas, width: number, height: number) {
  return {
    ...canvas.toJSON(),
    zunexiCanvasWidth: width,
    zunexiCanvasHeight: height,
  };
}

function prepareCanvasJson(value: unknown, targetWidth: number, targetHeight: number) {
  const normalized = normalizeCanvasJson(value) as any;
  if (!normalized || typeof normalized !== "object") return normalized;

  const sourceWidth = Number(normalized.zunexiCanvasWidth || 0);
  const sourceHeight = Number(normalized.zunexiCanvasHeight || 0);
  if (!sourceWidth || !sourceHeight || (sourceWidth === targetWidth && sourceHeight === targetHeight)) return normalized;

  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;
  const objects = Array.isArray(normalized.objects) ? normalized.objects.map((object: any) => ({
    ...object,
    left: typeof object.left === "number" ? object.left * scaleX : object.left,
    top: typeof object.top === "number" ? object.top * scaleY : object.top,
    scaleX: (typeof object.scaleX === "number" ? object.scaleX : 1) * scaleX,
    scaleY: (typeof object.scaleY === "number" ? object.scaleY : 1) * scaleY,
  })) : normalized.objects;

  return {
    ...normalized,
    objects,
    zunexiCanvasWidth: targetWidth,
    zunexiCanvasHeight: targetHeight,
  };
}
