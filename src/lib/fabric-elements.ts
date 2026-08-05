import * as fabric from "fabric";
import type { ElementDesc } from "@/lib/layouts";

type CanvasLike = fabric.Canvas | fabric.StaticCanvas;

export async function ensureFabricFont(fontFamily?: string, weight: number | string = 400, size = 64) {
  if (!fontFamily || typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await document.fonts.load(`${weight} ${Math.max(12, Math.round(size))}px "${fontFamily}"`);
  } catch {
    // A fonte de fallback continua utilizável; não bloqueie a abertura do editor.
  }
}

export async function addElementDescToCanvas(canvas: CanvasLike, el: ElementDesc) {
  if (el.kind === "rect") {
    const object = new fabric.Rect({
      left: el.x,
      top: el.y,
      width: el.w,
      height: el.h,
      fill: el.fill,
      opacity: el.opacity ?? 1,
      rx: el.rx || 0,
      ry: el.rx || 0,
      selectable: el.selectable ?? true,
      evented: el.selectable ?? true,
      objectCaching: false,
    });
    (object as any).name = el.name || (el.role === "background" ? "Fundo" : "Retângulo");
    (object as any).zunexiKind = "rect";
    (object as any).zunexiRole = el.role || "shape";
    canvas.add(object);
    return;
  }

  if (el.kind === "circle") {
    const object = new fabric.Circle({
      left: el.cx - el.r,
      top: el.cy - el.r,
      radius: el.r,
      fill: el.fill,
      opacity: el.opacity ?? 1,
      selectable: el.selectable ?? true,
      evented: el.selectable ?? true,
      objectCaching: false,
    });
    (object as any).name = el.name || "Círculo";
    (object as any).zunexiKind = "circle";
    (object as any).zunexiRole = el.role || "shape";
    canvas.add(object);
    return;
  }

  if (el.kind === "text") {
    await ensureFabricFont(el.font || "Inter", el.weight ?? 400, el.size);
    const textbox = new fabric.Textbox(el.text, {
      left: el.x,
      top: el.y,
      width: el.w,
      fontSize: el.size,
      fill: el.color,
      textAlign: el.align,
      fontWeight: el.weight ?? 400,
      fontStyle: el.italic ? "italic" : "normal",
      fontFamily: el.font || "Inter",
      lineHeight: el.lineHeight ?? 1.02,
      charSpacing: el.charSpacing ?? 0,
      splitByGrapheme: false,
      objectCaching: false,
      selectable: el.selectable ?? true,
      evented: el.selectable ?? true,
    });
    if (el.shadow) {
      textbox.set("shadow", new fabric.Shadow({
        color: "rgba(0,0,0,0.48)",
        blur: 18,
        offsetX: 0,
        offsetY: 4,
      }));
    }
    (textbox as any).name = el.name || (el.role === "body" ? "Texto" : el.role === "title" ? "Título" : "");
    (textbox as any).zunexiKind = "text";
    (textbox as any).zunexiRole = el.role || "copy";
    canvas.add(textbox);
    return;
  }

  const image = await loadFabricImage(el.url);
  const sourceWidth = image.width || 1;
  const sourceHeight = image.height || 1;
  const scale = Math.max(el.w / sourceWidth, el.h / sourceHeight);
  const cropWidth = Math.max(1, Math.min(sourceWidth, el.w / scale));
  const cropHeight = Math.max(1, Math.min(sourceHeight, el.h / scale));

  image.set({
    left: el.x,
    top: el.y,
    width: cropWidth,
    height: cropHeight,
    cropX: Math.max(0, (sourceWidth - cropWidth) / 2),
    cropY: Math.max(0, (sourceHeight - cropHeight) / 2),
    scaleX: scale,
    scaleY: scale,
    opacity: el.opacity ?? 1,
    objectCaching: false,
    selectable: el.selectable ?? true,
    evented: el.selectable ?? true,
  });
  (image as any).name = el.name || "Imagem principal";
  (image as any).zunexiKind = "image";
  (image as any).zunexiRole = el.role || "hero";
  (image as any).zunexiSourceUrl = el.url;
  canvas.add(image);
}

/**
 * Redimensiona as coordenadas lógicas antes de desenhar.
 *
 * Não usamos mais o `multiplier` do Fabric para miniaturas. Em alguns
 * navegadores/Fabric 7 ele criava um arquivo maior, mas mantinha os objetos
 * no tamanho reduzido no canto superior esquerdo. Isso era exatamente o que
 * fazia a arte correta da etapa de criação aparecer pequena e deslocada na
 * finalização e nos projetos.
 */
function scaleElementDesc(el: ElementDesc, scale: number): ElementDesc {
  if (scale === 1) return el;

  if (el.kind === "rect") {
    return {
      ...el,
      x: el.x * scale,
      y: el.y * scale,
      w: el.w * scale,
      h: el.h * scale,
      rx: el.rx === undefined ? undefined : el.rx * scale,
    };
  }

  if (el.kind === "circle") {
    return {
      ...el,
      cx: el.cx * scale,
      cy: el.cy * scale,
      r: el.r * scale,
    };
  }

  if (el.kind === "text") {
    return {
      ...el,
      x: el.x * scale,
      y: el.y * scale,
      w: el.w * scale,
      size: el.size * scale,
    };
  }

  return {
    ...el,
    x: el.x * scale,
    y: el.y * scale,
    w: el.w * scale,
    h: el.h * scale,
  };
}

export async function renderElementsThumbnail(args: {
  elements: ElementDesc[];
  background: string;
  width: number;
  height: number;
  maxDimension?: number;
  format?: "jpeg" | "png";
  quality?: number;
}) {
  if (typeof document === "undefined") return undefined;

  const maxDimension = Math.max(160, args.maxDimension ?? 420);
  const scale = Math.min(1, maxDimension / Math.max(args.width, args.height));
  const renderWidth = Math.max(1, Math.round(args.width * scale));
  const renderHeight = Math.max(1, Math.round(args.height * scale));
  const element = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(element, {
    width: renderWidth,
    height: renderHeight,
    backgroundColor: args.background,
    renderOnAddRemove: false,
    enableRetinaScaling: false,
  });

  try {
    for (const item of args.elements) {
      await addElementDescToCanvas(canvas, scaleElementDesc(item, scale));
    }
    canvas.renderAll();
    return canvas.toDataURL({
      format: args.format ?? "jpeg",
      quality: args.quality ?? 0.82,
      multiplier: 1,
    });
  } catch (error) {
    console.warn("Não foi possível gerar a miniatura fiel do layout:", error);
    return undefined;
  } finally {
    canvas.dispose();
  }
}

export async function loadFabricImage(source: string) {
  const normalizedSource = normalizeImageSource(source);
  if (!/^https?:\/\//i.test(normalizedSource)) {
    return fabric.FabricImage.fromURL(normalizedSource);
  }

  try {
    return await fabric.FabricImage.fromURL(normalizedSource, { crossOrigin: "anonymous" });
  } catch {
    return fabric.FabricImage.fromURL(normalizedSource);
  }
}

export function normalizeCanvasJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCanvasJson);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "src" && typeof item === "string" ? normalizeImageSource(item) : normalizeCanvasJson(item),
    ]),
  );
}

export function normalizeImageSource(source: string) {
  const match = source.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
  if (!match || !match[2]) return source;

  const currentType = match[1].toLowerCase();
  if (currentType.startsWith("image/")) return source;

  try {
    const header = atob(match[3].slice(0, 96));
    const bytes = Array.from(header, (char) => char.charCodeAt(0));
    let mime = "image/png";

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = "image/jpeg";
    else if (header.startsWith("GIF8")) mime = "image/gif";
    else if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") mime = "image/webp";
    else if (header.includes("<svg")) mime = "image/svg+xml";

    return `data:${mime};base64,${match[3]}`;
  } catch {
    return source;
  }
}
