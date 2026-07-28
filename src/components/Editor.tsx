import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as fabric from "fabric";
import type { ElementDesc } from "@/lib/layouts";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Circle as CircleIcon,
  Copy,
  Download,
  Eye,
  EyeOff,
  Hand,
  Image as ImageIcon,
  Italic,
  Layers3,
  Lock,
  Maximize2,
  MousePointer2,
  Move,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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

type EditorTool = "move" | "text" | "image" | "rect" | "circle" | "hand";
type InspectorTab = "properties" | "layers";

const CUSTOM_SERIALIZED_PROPERTIES = ["name", "zunexiKind", "zunexiRole", "zunexiSourceUrl", "zunexiLocked"];

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { width, height, initial, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fcRef = useRef<fabric.Canvas | null>(null);
  const onChangeRef = useRef(onChange);
  const history = useRef<string[]>([]);
  const historyIdx = useRef(-1);
  const skipHistory = useRef(false);
  const initialLoaded = useRef(false);
  const userAdjustedZoom = useRef(false);
  const handPanRef = useRef<{ active: boolean; x: number; y: number; left: number; top: number }>({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const [sel, setSel] = useState<fabric.FabricObject | null>(null);
  const [zoom, setZoom] = useState(0.5);
  const [tool, setTool] = useState<EditorTool>("move");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("layers");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [uiVersion, setUiVersion] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const renderLogicalDataUrl = useCallback((format: "png" | "jpeg", multiplier = 1, quality = 1) => {
    const canvas = fcRef.current;
    if (!canvas) return null;
    // O backing store permanece sempre nas dimensões lógicas do documento.
    // O zoom do editor é apenas CSS, então a exportação nunca herda escala de tela.
    canvas.requestRenderAll();
    return canvas.toDataURL({ format, quality, multiplier });
  }, []);

  useImperativeHandle(ref, () => ({
    getDataUrl(multiplier = 1) {
      return renderLogicalDataUrl("png", multiplier);
    },
    exportPng(filename = "post.png", multiplier = 1) {
      const dataUrl = renderLogicalDataUrl("png", multiplier);
      if (!dataUrl) return null;
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = filename;
      anchor.click();
      return dataUrl;
    },
    async exportPsd(filename = "zunexi-design.psd") {
      const canvas = fcRef.current;
      if (!canvas) return false;
      canvas.requestRenderAll();
      return await exportFabricCanvasToPsd(canvas, filename);
    },
  }), [renderLogicalDataUrl]);

  const emit = useCallback(() => {
    const canvas = fcRef.current;
    if (!canvas || !initialLoaded.current) return;
    const json = serializeCanvas(canvas, width, height);
    const displayMax = Math.max(canvas.width || 1, canvas.height || 1);
    const thumb = canvas.toDataURL({
      format: "jpeg",
      quality: 0.78,
      multiplier: Math.min(1, 420 / displayMax),
    });
    onChangeRef.current?.(json, thumb);
  }, [height, width]);

  const refreshUi = useCallback(() => {
    setUiVersion((value) => value + 1);
    const canvas = fcRef.current;
    setSel(canvas?.getActiveObject() || null);
  }, []);

  const snapshot = useCallback(() => {
    const canvas = fcRef.current;
    if (!canvas || skipHistory.current || !initialLoaded.current) return;
    const json = JSON.stringify(serializeCanvas(canvas, width, height));
    history.current = history.current.slice(0, historyIdx.current + 1);
    history.current.push(json);
    if (history.current.length > 80) history.current.shift();
    historyIdx.current = history.current.length - 1;
    refreshUi();
    emit();
  }, [emit, height, refreshUi, width]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: "#111111",
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
    });
    fcRef.current = canvas;
    skipHistory.current = true;
    initialLoaded.current = false;
    let cancelled = false;

    const selectionChanged = () => refreshUi();
    const objectChanged = (event?: { target?: fabric.FabricObject }) => {
      if (event?.target) keepObjectReachable(event.target);
      snapshot();
    };

    canvas.on("selection:created", selectionChanged);
    canvas.on("selection:updated", selectionChanged);
    canvas.on("selection:cleared", selectionChanged);
    canvas.on("object:modified", objectChanged);
    canvas.on("object:added", objectChanged);
    canvas.on("object:removed", objectChanged);

    async function loadInitial() {
      try {
        if (initial && "elements" in initial) {
          canvas.backgroundColor = initial.background || "#111111";
          for (const element of initial.elements as ElementDesc[]) {
            await addElementDescToCanvas(canvas, element);
          }
        } else if (initial) {
          await canvas.loadFromJSON(prepareCanvasJson(initial, width, height));
        }

        if (cancelled) return;
        repairLegacyObjects(canvas, width, height);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        initialLoaded.current = true;
        const json = JSON.stringify(serializeCanvas(canvas, width, height));
        history.current = [json];
        historyIdx.current = 0;
        refreshUi();
      } catch (error) {
        console.error("Falha ao carregar o projeto no editor", error);
      } finally {
        skipHistory.current = false;
      }
    }

    void loadInitial();

    return () => {
      cancelled = true;
      initialLoaded.current = false;
      canvas.dispose();
      fcRef.current = null;
    };
    // `initial` is intentionally loaded only when the editor key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, width]);

  const fitToWorkspace = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(100, viewport.clientWidth - 72);
    const availableHeight = Math.max(100, viewport.clientHeight - 72);
    const next = Math.min(availableWidth / width, availableHeight / height, 1.25);
    setZoom(Math.max(0.08, Math.min(2.5, next)));
  }, [height, width]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const resize = () => {
      if (!userAdjustedZoom.current) fitToWorkspace();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [fitToWorkspace]);

  // A prancheta SEMPRE continua em width × height lógicos. O zoom é somente
  // visual (CSS). Isso evita salvar objetos em coordenadas de um canvas reduzido
  // e elimina o erro de abrir a imagem/textos fora do campo de design.
  useEffect(() => {
    const canvas = fcRef.current;
    if (!canvas) return;
    const displayWidth = Math.max(1, Math.round(width * zoom));
    const displayHeight = Math.max(1, Math.round(height * zoom));
    canvas.setDimensions(
      { width: `${displayWidth}px`, height: `${displayHeight}px` },
      { cssOnly: true },
    );
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    if (canvas.wrapperEl) {
      canvas.wrapperEl.style.width = `${displayWidth}px`;
      canvas.wrapperEl.style.height = `${displayHeight}px`;
    }
    canvas.calcOffset();
    canvas.requestRenderAll();
  }, [height, width, zoom]);

  useEffect(() => {
    const canvas = fcRef.current;
    if (!canvas) return;
    const handMode = tool === "hand";
    canvas.selection = !handMode;
    canvas.defaultCursor = handMode ? "grab" : "default";
    canvas.hoverCursor = handMode ? "grab" : "move";
    canvas.getObjects().forEach((object) => {
      if ((object as any).zunexiLocked) return;
      object.evented = !handMode;
      object.selectable = !handMode;
    });
    if (handMode) canvas.discardActiveObject();
    canvas.requestRenderAll();
    refreshUi();
  }, [refreshUi, tool]);

  function setManualZoom(value: number) {
    userAdjustedZoom.current = true;
    setZoom(Math.max(0.08, Math.min(3, value)));
  }

  function onWorkspacePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (tool !== "hand") return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    handPanRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onWorkspacePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (tool !== "hand" || !handPanRef.current.active) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = handPanRef.current.left - (event.clientX - handPanRef.current.x);
    viewport.scrollTop = handPanRef.current.top - (event.clientY - handPanRef.current.y);
  }

  function onWorkspacePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!handPanRef.current.active) return;
    handPanRef.current.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function resetFit() {
    userAdjustedZoom.current = false;
    fitToWorkspace();
  }

  async function restore() {
    const canvas = fcRef.current;
    if (!canvas || historyIdx.current < 0) return;
    skipHistory.current = true;
    await canvas.loadFromJSON(JSON.parse(history.current[historyIdx.current]));
    repairLegacyObjects(canvas, width, height);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    skipHistory.current = false;
    refreshUi();
    emit();
  }

  function undo() {
    if (historyIdx.current <= 0) return;
    historyIdx.current -= 1;
    void restore();
  }

  function redo() {
    if (historyIdx.current >= history.current.length - 1) return;
    historyIdx.current += 1;
    void restore();
  }

  function addText() {
    const canvas = fcRef.current;
    if (!canvas) return;
    const text = new fabric.Textbox("Novo texto", {
      left: width * 0.18,
      top: height * 0.42,
      width: width * 0.64,
      fontSize: Math.max(36, width * 0.055),
      fill: "#ffffff",
      fontFamily: "Inter",
      fontWeight: 600,
      textAlign: "center",
      objectCaching: false,
    });
    (text as any).name = "Texto";
    (text as any).zunexiKind = "text";
    canvas.add(text);
    canvas.setActiveObject(text);
    setTool("move");
    canvas.requestRenderAll();
  }

  function addRect() {
    const canvas = fcRef.current;
    if (!canvas) return;
    const rect = new fabric.Rect({
      left: width * 0.35,
      top: height * 0.35,
      width: width * 0.3,
      height: height * 0.2,
      fill: "#4d6bff",
      rx: 18,
      ry: 18,
    });
    (rect as any).name = "Retângulo";
    (rect as any).zunexiKind = "rect";
    canvas.add(rect);
    canvas.setActiveObject(rect);
    setTool("move");
    canvas.requestRenderAll();
  }

  function addCircle() {
    const canvas = fcRef.current;
    if (!canvas) return;
    const radius = width * 0.11;
    const circle = new fabric.Circle({
      left: width / 2 - radius,
      top: height / 2 - radius,
      radius,
      fill: "#8b5cf6",
    });
    (circle as any).name = "Círculo";
    (circle as any).zunexiKind = "circle";
    canvas.add(circle);
    canvas.setActiveObject(circle);
    setTool("move");
    canvas.requestRenderAll();
  }

  async function addImageUrl(url: string) {
    const canvas = fcRef.current;
    if (!canvas) return;
    const image = await loadFabricImage(url);
    const imageWidth = image.width || 1;
    const imageHeight = image.height || 1;
    const scale = Math.min((width * 0.68) / imageWidth, (height * 0.68) / imageHeight);
    image.set({
      left: width / 2 - (imageWidth * scale) / 2,
      top: height / 2 - (imageHeight * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      objectCaching: false,
    });
    (image as any).name = "Imagem";
    (image as any).zunexiKind = "image";
    (image as any).zunexiSourceUrl = url;
    canvas.add(image);
    canvas.setActiveObject(image);
    setTool("move");
    canvas.requestRenderAll();
  }

  function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => void addImageUrl(String(reader.result));
    reader.readAsDataURL(file);
    event.currentTarget.value = "";
  }

  function del(object = fcRef.current?.getActiveObject()) {
    const canvas = fcRef.current;
    if (!canvas || !object) return;
    canvas.remove(object);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }

  function dup(object = fcRef.current?.getActiveObject()) {
    const canvas = fcRef.current;
    if (!canvas || !object) return;
    object.clone(CUSTOM_SERIALIZED_PROPERTIES).then((clone: fabric.FabricObject) => {
      clone.set({ left: (object.left || 0) + 28, top: (object.top || 0) + 28 });
      canvas.add(clone);
      canvas.setActiveObject(clone);
      canvas.requestRenderAll();
    });
  }

  function setObjectValue(object: fabric.FabricObject, key: string, value: unknown, record = true) {
    (object as any).set(key, value);
    object.setCoords();
    fcRef.current?.requestRenderAll();
    refreshUi();
    if (record) snapshot();
  }

  function setObjectPosition(object: fabric.FabricObject, axis: "left" | "top", value: number) {
    if (!Number.isFinite(value)) return;
    setObjectValue(object, axis, value);
  }

  function setObjectDimension(object: fabric.FabricObject, dimension: "width" | "height", value: number) {
    if (!Number.isFinite(value) || value <= 1) return;
    const current = dimension === "width" ? object.getScaledWidth() : object.getScaledHeight();
    if (!current) return;
    const ratio = value / current;
    if (dimension === "width") object.scaleX = (object.scaleX || 1) * ratio;
    else object.scaleY = (object.scaleY || 1) * ratio;
    object.setCoords();
    fcRef.current?.requestRenderAll();
    refreshUi();
    snapshot();
  }

  function toggleVisibility(object: fabric.FabricObject) {
    object.visible = object.visible === false;
    if (!object.visible && fcRef.current?.getActiveObject() === object) fcRef.current.discardActiveObject();
    object.setCoords();
    fcRef.current?.requestRenderAll();
    refreshUi();
    snapshot();
  }

  function toggleLock(object: fabric.FabricObject) {
    const locked = !(object as any).zunexiLocked;
    (object as any).zunexiLocked = locked;
    object.selectable = !locked;
    object.evented = !locked;
    object.lockMovementX = locked;
    object.lockMovementY = locked;
    object.lockScalingX = locked;
    object.lockScalingY = locked;
    object.lockRotation = locked;
    if (locked && fcRef.current?.getActiveObject() === object) fcRef.current.discardActiveObject();
    fcRef.current?.requestRenderAll();
    refreshUi();
  }

  function moveLayer(object: fabric.FabricObject, direction: "up" | "down") {
    const canvas = fcRef.current;
    if (!canvas) return;
    if (direction === "up") canvas.bringObjectForward(object);
    else canvas.sendObjectBackwards(object);
    canvas.requestRenderAll();
    refreshUi();
    snapshot();
  }

  function selectLayer(object: fabric.FabricObject) {
    const canvas = fcRef.current;
    if (!canvas || object.visible === false || object.selectable === false) return;
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    refreshUi();
  }

  function repairCanvas() {
    const canvas = fcRef.current;
    if (!canvas) return;
    repairLegacyObjects(canvas, width, height, true);
    canvas.requestRenderAll();
    refreshUi();
    snapshot();
  }

  function keepObjectReachable(object: fabric.FabricObject) {
    const objectWidth = Math.max(1, object.getScaledWidth());
    const objectHeight = Math.max(1, object.getScaledHeight());
    const minVisibleX = Math.min(80, objectWidth * 0.18);
    const minVisibleY = Math.min(80, objectHeight * 0.18);
    object.left = clampNumber(object.left || 0, -objectWidth + minVisibleX, width - minVisibleX);
    object.top = clampNumber(object.top || 0, -objectHeight + minVisibleY, height - minVisibleY);
    object.setCoords();
  }

  const objects = useMemo(() => {
    void uiVersion;
    return [...(fcRef.current?.getObjects() || [])].reverse();
  }, [uiVersion]);

  const isText = sel instanceof fabric.Textbox || sel instanceof fabric.IText || sel instanceof fabric.Text;
  const selectedFill = typeof (sel as any)?.fill === "string" ? String((sel as any).fill) : "#ffffff";

  return (
    <div className="grid h-full min-h-0 grid-cols-[42px_minmax(0,1fr)] grid-rows-[40px_minmax(0,1fr)_34px] overflow-hidden bg-[#1f1f1f] text-[#e8e8e8] md:grid-cols-[48px_minmax(0,1fr)_286px] md:grid-rows-[40px_minmax(0,1fr)_30px]">
      {/* Photoshop-like contextual options bar */}
      <div className="col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto border-b border-[#343434] bg-[#252525] px-2 text-[11px] md:col-span-3">
        <div className="flex items-center gap-1.5 border-r border-[#3a3a3a] pr-3">
          <MousePointer2 className="h-3.5 w-3.5 text-[#c9c9c9]" />
          <span className="font-medium capitalize">{tool === "rect" ? "retângulo" : tool === "circle" ? "círculo" : tool === "hand" ? "mão" : tool}</span>
        </div>
        <button onClick={undo} className="editor-option-btn"><Undo2 className="h-3.5 w-3.5" /> Desfazer</button>
        <button onClick={redo} className="editor-option-btn"><Redo2 className="h-3.5 w-3.5" /> Refazer</button>
        <div className="h-5 w-px bg-[#3b3b3b]" />
        <button onClick={() => dup()} disabled={!sel} className="editor-option-btn disabled:opacity-35"><Copy className="h-3.5 w-3.5" /> Duplicar</button>
        <button onClick={() => del()} disabled={!sel} className="editor-option-btn disabled:opacity-35"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
        <div className="ml-auto flex items-center gap-2 pl-3">
          <span className="text-[#a9a9a9]">{width} × {height}px</span>
          <button onClick={resetFit} className="editor-option-btn"><Maximize2 className="h-3.5 w-3.5" /> Ajustar</button>
        </div>
      </div>

      {/* Left vertical tools */}
      <aside className="row-start-2 flex min-h-0 flex-col items-center gap-1 border-r border-[#343434] bg-[#242424] py-2">
        <VerticalTool active={tool === "move"} icon={Move} label="Mover / selecionar" onClick={() => setTool("move")} />
        <VerticalTool active={tool === "text"} icon={Type} label="Texto" onClick={() => { setTool("text"); addText(); }} />
        <VerticalTool active={tool === "image"} icon={ImageIcon} label="Inserir imagem" onClick={() => { setTool("image"); document.getElementById("zunexi-editor-upload")?.click(); }} />
        <input id="zunexi-editor-upload" type="file" accept="image/*" onChange={onUpload} className="hidden" />
        <VerticalTool active={tool === "rect"} icon={Square} label="Retângulo" onClick={() => { setTool("rect"); addRect(); }} />
        <VerticalTool active={tool === "circle"} icon={CircleIcon} label="Círculo" onClick={() => { setTool("circle"); addCircle(); }} />
        <div className="my-1 h-px w-7 bg-[#3b3b3b]" />
        <VerticalTool active={tool === "hand"} icon={Hand} label="Mão" onClick={() => setTool(tool === "hand" ? "move" : "hand")} />
        <VerticalTool icon={ZoomIn} label="Aumentar zoom" onClick={() => setManualZoom(zoom + 0.1)} />
        <VerticalTool icon={ZoomOut} label="Diminuir zoom" onClick={() => setManualZoom(zoom - 0.1)} />
        <div className="mt-auto flex flex-col gap-1 pb-1">
          <VerticalTool icon={RotateCcw} label="Reencaixar camadas" onClick={repairCanvas} />
        </div>
      </aside>

      {/* Document workspace */}
      <main
        ref={viewportRef}
        onPointerDown={onWorkspacePointerDown}
        onPointerMove={onWorkspacePointerMove}
        onPointerUp={onWorkspacePointerUp}
        onPointerCancel={onWorkspacePointerUp}
        className={`relative row-start-2 min-h-0 min-w-0 overflow-auto bg-[#191919] ${tool === "hand" ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.035) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className="flex min-h-full min-w-full items-center justify-center p-9">
          <div
            className="relative shrink-0 overflow-hidden border border-black/70 bg-white shadow-[0_18px_70px_rgba(0,0,0,.62)]"
            style={{ width: Math.round(width * zoom), height: Math.round(height * zoom) }}
          >
            <canvas ref={canvasRef} />
          </div>
        </div>
      </main>

      {/* Right inspector */}
      <aside className={`${mobileInspectorOpen ? "fixed inset-x-2 bottom-10 z-40 block max-h-[46dvh] overflow-hidden rounded-lg border border-[#444] shadow-2xl" : "hidden"} row-start-2 min-h-0 border-l border-[#343434] bg-[#242424] md:static md:block md:max-h-none md:rounded-none md:border-y-0 md:border-r-0 md:shadow-none`}>
        <div className="grid h-full min-h-0 grid-rows-[38px_minmax(0,1fr)]">
          <div className="grid grid-cols-2 border-b border-[#393939] text-[11px] font-medium">
            <button onClick={() => setInspectorTab("properties")} className={inspectorTab === "properties" ? "bg-[#303030] text-white" : "text-[#b7b7b7] hover:bg-[#2b2b2b]"}>
              <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Propriedades</span>
            </button>
            <button onClick={() => setInspectorTab("layers")} className={inspectorTab === "layers" ? "bg-[#303030] text-white" : "text-[#b7b7b7] hover:bg-[#2b2b2b]"}>
              <span className="inline-flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5" /> Camadas</span>
            </button>
          </div>

          {inspectorTab === "layers" ? (
            <div className="min-h-0 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#343434] px-3 py-2 text-[10px] uppercase tracking-[.12em] text-[#8f8f8f]">
                <span>{objects.length} camadas</span>
                <button onClick={repairCanvas} className="rounded px-1.5 py-1 normal-case tracking-normal hover:bg-[#343434]" title="Corrigir elementos que estejam fora da prancheta">
                  Reencaixar
                </button>
              </div>
              <div className="py-1">
                {objects.map((object, index) => {
                  const active = object === sel;
                  const locked = Boolean((object as any).zunexiLocked) || object.selectable === false;
                  const visible = object.visible !== false;
                  return (
                    <div
                      key={`${object.type}-${index}`}
                      className={`group grid grid-cols-[26px_26px_minmax(0,1fr)_24px_24px] items-center gap-0 border-b border-[#303030] px-1 py-1 ${active ? "bg-[#3b536f]" : "hover:bg-[#2c2c2c]"}`}
                    >
                      <button onClick={() => toggleVisibility(object)} className="grid h-7 place-items-center text-[#c7c7c7]" title={visible ? "Ocultar camada" : "Mostrar camada"}>
                        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-[#777]" />}
                      </button>
                      <button onClick={() => toggleLock(object)} className="grid h-7 place-items-center text-[#c7c7c7]" title={locked ? "Desbloquear camada" : "Bloquear camada"}>
                        {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-45" />}
                      </button>
                      <button onClick={() => selectLayer(object)} className="min-w-0 py-1 text-left text-[11px]">
                        <span className="block truncate">{layerLabel(object)}</span>
                        <span className="block truncate text-[9px] text-[#a4a4a4]">{layerTypeLabel(object)}</span>
                      </button>
                      <button onClick={() => moveLayer(object, "up")} className="grid h-7 place-items-center opacity-0 group-hover:opacity-100" title="Subir camada"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => moveLayer(object, "down")} className="grid h-7 place-items-center opacity-0 group-hover:opacity-100" title="Descer camada"><ChevronDown className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <PropertiesPanel
              selected={sel}
              isText={isText}
              fill={selectedFill}
              canvas={fcRef.current}
              onSet={setObjectValue}
              onPosition={setObjectPosition}
              onDimension={setObjectDimension}
              onSnapshot={snapshot}
              onRefresh={refreshUi}
            />
          )}
        </div>
      </aside>

      {/* Status bar */}
      <footer className="col-span-2 row-start-3 flex items-center border-t border-[#343434] bg-[#242424] px-2 text-[10px] text-[#b0b0b0] md:col-span-3">
        <div className="flex items-center gap-2 border-r border-[#3b3b3b] pr-3">
          <button onClick={() => setManualZoom(zoom - 0.1)} className="rounded p-1 hover:bg-[#343434]"><ZoomOut className="h-3 w-3" /></button>
          <button onClick={resetFit} className="min-w-12 rounded px-1 py-0.5 text-center hover:bg-[#343434]">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setManualZoom(zoom + 0.1)} className="rounded p-1 hover:bg-[#343434]"><ZoomIn className="h-3 w-3" /></button>
        </div>
        <span className="hidden px-3 sm:inline">Documento: {width} × {height}px</span>
        <button
          type="button"
          onClick={() => setMobileInspectorOpen((value) => !value)}
          className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-[#343434] md:hidden"
        >
          <Layers3 className="h-3 w-3" /> {mobileInspectorOpen ? "Fechar" : "Camadas"}
        </button>
        <span className="ml-auto hidden pr-2 md:inline">Zunexi Editor · camadas editáveis</span>
      </footer>
    </div>
  );
});

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function VerticalTool({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-[3px] border text-[#d6d6d6] transition ${
        active ? "border-[#737373] bg-[#3b3b3b] text-white" : "border-transparent hover:bg-[#333333]"
      }`}
    >
      <Icon className="h-[17px] w-[17px]" />
    </button>
  );
}

function PropertiesPanel({
  selected,
  isText,
  fill,
  canvas,
  onSet,
  onPosition,
  onDimension,
  onSnapshot,
  onRefresh,
}: {
  selected: fabric.FabricObject | null;
  isText: boolean;
  fill: string;
  canvas: fabric.Canvas | null;
  onSet: (object: fabric.FabricObject, key: string, value: unknown, record?: boolean) => void;
  onPosition: (object: fabric.FabricObject, axis: "left" | "top", value: number) => void;
  onDimension: (object: fabric.FabricObject, dimension: "width" | "height", value: number) => void;
  onSnapshot: () => void;
  onRefresh: () => void;
}) {
  if (!selected) {
    return (
      <div className="p-4 text-[11px] leading-relaxed text-[#999]">
        <div className="mb-2 font-medium text-[#ddd]">Nenhuma camada selecionada</div>
        Selecione um elemento na arte ou no painel de camadas para editar posição, tamanho, cor e tipografia.
      </div>
    );
  }

  const scaledWidth = Math.max(1, Math.round(selected.getScaledWidth()));
  const scaledHeight = Math.max(1, Math.round(selected.getScaledHeight()));
  const textbox = isText ? (selected as fabric.Textbox) : null;

  return (
    <div className="min-h-0 overflow-y-auto pb-5">
      <InspectorSection title="Transformar">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={Math.round(selected.left || 0)} onCommit={(value) => onPosition(selected, "left", value)} />
          <NumberField label="Y" value={Math.round(selected.top || 0)} onCommit={(value) => onPosition(selected, "top", value)} />
          <NumberField label="L" value={scaledWidth} onCommit={(value) => onDimension(selected, "width", value)} />
          <NumberField label="A" value={scaledHeight} onCommit={(value) => onDimension(selected, "height", value)} />
          <NumberField label="Ângulo" value={Math.round(selected.angle || 0)} onCommit={(value) => onSet(selected, "angle", value)} />
          <NumberField label="Opacidade" value={Math.round((selected.opacity ?? 1) * 100)} min={0} max={100} onCommit={(value) => onSet(selected, "opacity", Math.max(0, Math.min(100, value)) / 100)} />
        </div>
      </InspectorSection>

      {isText && textbox && (
        <InspectorSection title="Texto">
          <textarea
            value={textbox.text || ""}
            onChange={(event) => {
              textbox.set("text", event.target.value);
              canvas?.requestRenderAll();
              onRefresh();
            }}
            onBlur={onSnapshot}
            className="mb-2 min-h-20 w-full resize-y rounded-[3px] border border-[#4a4a4a] bg-[#1e1e1e] p-2 text-[11px] outline-none focus:border-[#6f9dd1]"
          />
          <label className="mb-2 block text-[10px] text-[#aaa]">Fonte</label>
          <select
            value={textbox.fontFamily || "Inter"}
            onChange={(event) => onSet(textbox, "fontFamily", event.target.value)}
            className="mb-2 h-8 w-full rounded-[3px] border border-[#4a4a4a] bg-[#1d1d1d] px-2 text-[11px] outline-none"
          >
            {["Inter", "Space Grotesk", "Syne", "Archivo Black", "Playfair Display", "Bebas Neue", "DM Serif Display"].map((font) => <option key={font}>{font}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Tamanho" value={Math.round(textbox.fontSize || 48)} min={8} max={600} onCommit={(value) => onSet(textbox, "fontSize", value)} />
            <NumberField label="Entrelinha" value={Math.round((textbox.lineHeight || 1.16) * 100)} min={60} max={300} onCommit={(value) => onSet(textbox, "lineHeight", value / 100)} />
          </div>
          <div className="mt-3 flex items-center gap-1">
            <InspectorIconButton onClick={() => onSet(textbox, "fontWeight", textbox.fontWeight === "bold" || Number(textbox.fontWeight) >= 700 ? 400 : 700)} icon={Bold} title="Negrito" />
            <InspectorIconButton onClick={() => onSet(textbox, "fontStyle", textbox.fontStyle === "italic" ? "normal" : "italic")} icon={Italic} title="Itálico" />
            <InspectorIconButton onClick={() => onSet(textbox, "textAlign", "left")} icon={AlignLeft} title="Alinhar à esquerda" />
            <InspectorIconButton onClick={() => onSet(textbox, "textAlign", "center")} icon={AlignCenter} title="Centralizar" />
            <InspectorIconButton onClick={() => onSet(textbox, "textAlign", "right")} icon={AlignRight} title="Alinhar à direita" />
          </div>
        </InspectorSection>
      )}

      {typeof (selected as any).fill === "string" && !(selected instanceof fabric.FabricImage) && (
        <InspectorSection title="Aparência">
          <label className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-[#aaa]">Cor</span>
            <span className="flex items-center gap-2 rounded-[3px] border border-[#464646] bg-[#1d1d1d] px-2 py-1">
              <input type="color" value={fill} onChange={(event) => onSet(selected, "fill", event.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
              <span className="font-mono text-[10px] uppercase text-[#c9c9c9]">{fill}</span>
            </span>
          </label>
        </InspectorSection>
      )}
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#393939] p-3">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[#aaa]">{title}</h3>
      {children}
    </section>
  );
}

function InspectorIconButton({ icon: Icon, title, onClick }: { icon: React.ComponentType<{ className?: string }>; title: string; onClick: () => void }) {
  return <button onClick={onClick} title={title} className="grid h-8 w-8 place-items-center rounded-[3px] border border-[#444] bg-[#1d1d1d] hover:bg-[#383838]"><Icon className="h-3.5 w-3.5" /></button>;
}

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    onCommit(Math.max(min ?? -100000, Math.min(max ?? 100000, parsed)));
  }
  return (
    <label className="grid grid-cols-[34px_minmax(0,1fr)] items-center rounded-[3px] border border-[#444] bg-[#1d1d1d] text-[10px]">
      <span className="px-2 text-[#9f9f9f]">{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        className="h-8 min-w-0 border-l border-[#444] bg-transparent px-2 text-right text-[11px] outline-none focus:bg-[#272727]"
      />
    </label>
  );
}

function layerLabel(object: fabric.FabricObject) {
  const custom = String((object as any).name || "").trim();
  if (custom) return custom;
  if (object instanceof fabric.Textbox || object instanceof fabric.IText || object instanceof fabric.Text) {
    const text = String((object as any).text || "Texto").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 34) : "Texto";
  }
  if (object instanceof fabric.FabricImage) return "Imagem";
  if (object instanceof fabric.Rect) return "Retângulo";
  if (object instanceof fabric.Circle) return "Círculo";
  return "Camada";
}

function layerTypeLabel(object: fabric.FabricObject) {
  if (object instanceof fabric.Textbox || object instanceof fabric.IText || object instanceof fabric.Text) return "Texto";
  if (object instanceof fabric.FabricImage) return "Imagem";
  if (object instanceof fabric.Rect) return "Forma · retângulo";
  if (object instanceof fabric.Circle) return "Forma · círculo";
  return object.type || "Objeto";
}

function serializeCanvas(canvas: fabric.Canvas, width: number, height: number) {
  return {
    ...canvas.toJSON(CUSTOM_SERIALIZED_PROPERTIES),
    zunexiCanvasWidth: width,
    zunexiCanvasHeight: height,
    zunexiEditorVersion: 5,
  };
}

function prepareCanvasJson(value: unknown, targetWidth: number, targetHeight: number) {
  const normalized = normalizeCanvasJson(value) as any;
  if (!normalized || typeof normalized !== "object") return normalized;

  const sourceWidth = Number(normalized.zunexiCanvasWidth || targetWidth || 1);
  const sourceHeight = Number(normalized.zunexiCanvasHeight || targetHeight || 1);
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return normalized;

  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;
  const objects = Array.isArray(normalized.objects)
    ? normalized.objects.map((object: any) => ({
        ...object,
        left: typeof object.left === "number" ? object.left * scaleX : object.left,
        top: typeof object.top === "number" ? object.top * scaleY : object.top,
        scaleX: (typeof object.scaleX === "number" ? object.scaleX : 1) * scaleX,
        scaleY: (typeof object.scaleY === "number" ? object.scaleY : 1) * scaleY,
      }))
    : normalized.objects;

  return {
    ...normalized,
    objects,
    zunexiCanvasWidth: targetWidth,
    zunexiCanvasHeight: targetHeight,
    zunexiEditorVersion: 5,
  };
}

function repairLegacyObjects(canvas: fabric.Canvas, width: number, height: number, aggressive = false) {
  const objects = canvas.getObjects();
  for (const object of objects) {
    // Migração das versões antigas: a imagem principal podia ser salva como
    // um bloco pequeno no canto por causa do zoom aplicado ao backing store.
    // Para os layouts Zunexi atuais, a camada hero deve preencher a prancheta.
    if (object instanceof fabric.FabricImage && ((object as any).zunexiRole === "hero" || (object as any).name === "Imagem principal")) {
      const currentW = object.getScaledWidth();
      const currentH = object.getScaledHeight();
      if (aggressive || currentW < width * 0.72 || currentH < height * 0.72) {
        const element = object.getElement() as HTMLImageElement;
        const sourceWidth = element.naturalWidth || element.width || object.width || 1;
        const sourceHeight = element.naturalHeight || element.height || object.height || 1;
        const scale = Math.max(width / sourceWidth, height / sourceHeight);
        const cropWidth = Math.min(sourceWidth, width / scale);
        const cropHeight = Math.min(sourceHeight, height / scale);
        object.set({
          left: 0,
          top: 0,
          width: cropWidth,
          height: cropHeight,
          cropX: Math.max(0, (sourceWidth - cropWidth) / 2),
          cropY: Math.max(0, (sourceHeight - cropHeight) / 2),
          scaleX: scale,
          scaleY: scale,
        });
      }
    }
    if (!Number.isFinite(object.left || 0)) object.left = 0;
    if (!Number.isFinite(object.top || 0)) object.top = 0;
    if (!Number.isFinite(object.scaleX || 1) || Math.abs(object.scaleX || 1) < 0.0001) object.scaleX = 1;
    if (!Number.isFinite(object.scaleY || 1) || Math.abs(object.scaleY || 1) < 0.0001) object.scaleY = 1;

    let objectWidth = Math.max(1, object.getScaledWidth());
    let objectHeight = Math.max(1, object.getScaledHeight());

    // Old editor versions could save objects after the display canvas had been
    // resized. Only repair clearly impossible dimensions automatically.
    const maxW = width * (aggressive ? 1.25 : 3.5);
    const maxH = height * (aggressive ? 1.25 : 3.5);
    if (objectWidth > maxW || objectHeight > maxH) {
      const factor = Math.min(maxW / objectWidth, maxH / objectHeight);
      object.scaleX = (object.scaleX || 1) * factor;
      object.scaleY = (object.scaleY || 1) * factor;
      objectWidth = object.getScaledWidth();
      objectHeight = object.getScaledHeight();
    }

    const left = object.left || 0;
    const top = object.top || 0;
    const completelyOutside = left > width || top > height || left + objectWidth < 0 || top + objectHeight < 0;
    if (completelyOutside || aggressive) {
      object.left = Math.max(-objectWidth * 0.25, Math.min(width - objectWidth * 0.08, left));
      object.top = Math.max(-objectHeight * 0.25, Math.min(height - objectHeight * 0.08, top));
    }

    object.setCoords();
  }
  canvas.calcOffset();
}
