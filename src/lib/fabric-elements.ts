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
 * Renderizador 2D independente do Fabric para miniaturas e exportações finais.
 *
 * Em telas com escala do Windows/Retina (devicePixelRatio 2), algumas versões
 * do Fabric criavam um backing store duas vezes maior, mas mantinham os objetos
 * nas coordenadas reduzidas. O resultado era a arte inteira presa no quadrante
 * superior esquerdo, com o restante do canvas mostrando apenas a cor de fundo.
 *
 * Aqui o canvas nativo recebe dimensões físicas exatas e todos os elementos são
 * desenhados diretamente nessas dimensões. Assim, devicePixelRatio, zoom do
 * navegador e escala do Windows não alteram a posição nem o tamanho da arte.
 */
function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function splitLongCanvasWord(context: CanvasRenderingContext2D, word: string, maxWidth: number) {
  const chunks: string[] = [];
  let current = "";
  for (const character of Array.from(word)) {
    const next = current + character;
    if (current && context.measureText(next).width > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [word];
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const output: string[] = [];
  const paragraphs = String(text || "").replace(/\r/g, "").split("\n");

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (paragraphIndex < paragraphs.length - 1) output.push("");
      return;
    }

    let line = "";
    for (const originalWord of words) {
      const parts = context.measureText(originalWord).width > maxWidth
        ? splitLongCanvasWord(context, originalWord, maxWidth)
        : [originalWord];

      for (const word of parts) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > maxWidth) {
          output.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
    }
    if (line) output.push(line);
  });

  return output;
}

function loadCanvasImage(source: string): Promise<HTMLImageElement> {
  const normalizedSource = normalizeImageSource(source);

  function attempt(useCors: boolean) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      if (useCors && /^https?:\/\//i.test(normalizedSource)) image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Não foi possível carregar a imagem do slide."));
      image.src = normalizedSource;
    });
  }

  if (!/^https?:\/\//i.test(normalizedSource)) return attempt(false);
  return attempt(true).catch(() => attempt(false));
}

async function drawCanvasElement(
  context: CanvasRenderingContext2D,
  element: ElementDesc,
  scale: number,
) {
  context.save();

  try {
    if (element.kind === "rect") {
      const x = element.x * scale;
      const y = element.y * scale;
      const width = element.w * scale;
      const height = element.h * scale;
      context.globalAlpha = element.opacity ?? 1;
      context.fillStyle = element.fill;
      roundedRectPath(context, x, y, width, height, (element.rx || 0) * scale);
      context.fill();
      return;
    }

    if (element.kind === "circle") {
      context.globalAlpha = element.opacity ?? 1;
      context.fillStyle = element.fill;
      context.beginPath();
      context.arc(element.cx * scale, element.cy * scale, Math.max(0.5, element.r * scale), 0, Math.PI * 2);
      context.fill();
      return;
    }

    if (element.kind === "image") {
      const image = await loadCanvasImage(element.url);
      const sourceWidth = image.naturalWidth || image.width || 1;
      const sourceHeight = image.naturalHeight || image.height || 1;
      const destinationX = element.x * scale;
      const destinationY = element.y * scale;
      const destinationWidth = Math.max(1, element.w * scale);
      const destinationHeight = Math.max(1, element.h * scale);
      const sourceRatio = sourceWidth / sourceHeight;
      const destinationRatio = destinationWidth / destinationHeight;

      let sourceX = 0;
      let sourceY = 0;
      let cropWidth = sourceWidth;
      let cropHeight = sourceHeight;

      if (sourceRatio > destinationRatio) {
        cropWidth = sourceHeight * destinationRatio;
        sourceX = (sourceWidth - cropWidth) / 2;
      } else if (sourceRatio < destinationRatio) {
        cropHeight = sourceWidth / destinationRatio;
        sourceY = (sourceHeight - cropHeight) / 2;
      }

      context.globalAlpha = element.opacity ?? 1;
      context.drawImage(
        image,
        sourceX,
        sourceY,
        cropWidth,
        cropHeight,
        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight,
      );
      return;
    }

    const fontSize = Math.max(1, element.size * scale);
    const weight = element.weight ?? 400;
    const fontFamily = element.font || "Inter";
    await ensureFabricFont(fontFamily, weight, fontSize);

    context.globalAlpha = 1;
    context.fillStyle = element.color;
    context.textBaseline = "top";
    context.textAlign = element.align;
    context.font = `${element.italic ? "italic " : ""}${weight} ${fontSize}px "${fontFamily}", Inter, Arial, sans-serif`;

    if (element.shadow) {
      context.shadowColor = "rgba(0,0,0,0.48)";
      context.shadowBlur = 18 * scale;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 4 * scale;
    }

    const x = element.x * scale;
    const y = element.y * scale;
    const width = Math.max(1, element.w * scale);
    const lineHeight = fontSize * (element.lineHeight ?? 1.02);
    const lines = wrapCanvasText(context, element.text, width);
    const drawX = element.align === "center" ? x + width / 2 : element.align === "right" ? x + width : x;

    lines.forEach((line, index) => {
      context.fillText(line, drawX, y + index * lineHeight, width);
    });
  } finally {
    context.restore();
  }
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

  const logicalWidth = Math.max(1, Math.round(args.width));
  const logicalHeight = Math.max(1, Math.round(args.height));
  const maxDimension = Math.max(160, args.maxDimension ?? 420);
  const scale = Math.min(1, maxDimension / Math.max(logicalWidth, logicalHeight));
  const renderWidth = Math.max(1, Math.round(logicalWidth * scale));
  const renderHeight = Math.max(1, Math.round(logicalHeight * scale));

  const canvas = document.createElement("canvas");
  // Use atributos físicos, não CSS. O arquivo exportado terá exatamente estas
  // dimensões, mesmo quando o Windows estiver em 125%, 150% ou 200%.
  canvas.width = renderWidth;
  canvas.height = renderHeight;

  const context = canvas.getContext("2d", { alpha: args.format === "png" });
  if (!context) return undefined;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.globalAlpha = 1;
  context.fillStyle = args.background;
  context.fillRect(0, 0, renderWidth, renderHeight);

  try {
    for (const element of args.elements) {
      await drawCanvasElement(context, element, scale);
    }
    return canvas.toDataURL(`image/${args.format ?? "jpeg"}`, args.quality ?? 0.82);
  } catch (error) {
    console.warn("Não foi possível gerar a miniatura fiel do layout:", error);
    return undefined;
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
