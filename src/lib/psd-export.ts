import * as fabric from "fabric";

type PsdLayer = Record<string, unknown>;

const FONT_POSTSCRIPT_NAMES: Record<string, string> = {
  Inter: "Inter-Regular",
  "Space Grotesk": "SpaceGrotesk-Regular",
  "Playfair Display": "PlayfairDisplay-Regular",
  "Bebas Neue": "BebasNeue-Regular",
  "Archivo Black": "ArchivoBlack-Regular",
  Syne: "Syne-Regular",
  "DM Serif Display": "DMSerifDisplay-Regular",
};

function copyCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

function canvasComposite(source: fabric.Canvas) {
  const maybeCanvas = (source as fabric.Canvas & { toCanvasElement?: (multiplier?: number) => HTMLCanvasElement }).toCanvasElement?.(1);
  if (maybeCanvas) return copyCanvas(maybeCanvas);

  const canvas = document.createElement("canvas");
  canvas.width = source.width || 1;
  canvas.height = source.height || 1;
  return canvas;
}

function backgroundLayer(source: fabric.Canvas): PsdLayer | null {
  const background = source.backgroundColor;
  if (typeof background !== "string" || !background) return null;

  const canvas = document.createElement("canvas");
  canvas.width = source.width || 1;
  canvas.height = source.height || 1;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { name: "Fundo", canvas, top: 0, left: 0 };
}

function cssColorToRgb(value: unknown) {
  const fallback = { r: 255, g: 255, b: 255 };
  if (typeof value !== "string" || !value) return fallback;

  const helper = document.createElement("canvas").getContext("2d");
  if (!helper) return fallback;
  helper.fillStyle = "#ffffff";
  helper.fillStyle = value;
  const normalized = helper.fillStyle;

  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex.slice(0, 6);
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = normalized.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/i);
  if (!rgb) return fallback;
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

function layerName(object: fabric.FabricObject, index: number) {
  const anyObject = object as fabric.FabricObject & { text?: string };
  if (typeof anyObject.text === "string" && anyObject.text.trim()) {
    return `Texto — ${anyObject.text.trim().replace(/\s+/g, " ").slice(0, 36)}`;
  }
  if (object instanceof fabric.FabricImage) return `Imagem ${index + 1}`;
  if (object instanceof fabric.Rect) return `Forma retângulo ${index + 1}`;
  if (object instanceof fabric.Circle) return `Forma círculo ${index + 1}`;
  return `Elemento ${index + 1}`;
}

async function rasterizeObject(object: fabric.FabricObject) {
  const bounds = object.getBoundingRect();
  const padding = 8;
  const left = Math.floor(bounds.left) - padding;
  const top = Math.floor(bounds.top) - padding;
  const width = Math.max(1, Math.ceil(bounds.width) + padding * 2);
  const height = Math.max(1, Math.ceil(bounds.height) + padding * 2);

  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  const temp = new fabric.StaticCanvas(target, { width, height, backgroundColor: "transparent" });
  const clone = await object.clone();
  clone.set({
    left: (clone.left || 0) - left,
    top: (clone.top || 0) - top,
  });
  temp.add(clone);
  temp.renderAll();

  const result = copyCanvas(target);
  temp.dispose();
  return { canvas: result, left, top };
}

function textMetadata(object: fabric.FabricObject): Record<string, unknown> | undefined {
  if (!(object instanceof fabric.Textbox) && !(object instanceof fabric.IText) && !(object instanceof fabric.Text)) return undefined;
  if (Math.abs(object.angle || 0) > 0.01 || Math.abs(object.skewX || 0) > 0.01 || Math.abs(object.skewY || 0) > 0.01) return undefined;

  const textObject = object as fabric.Textbox;
  const fontFamily = String(textObject.fontFamily || "Arial");
  const scale = Math.abs(textObject.scaleY || 1);
  const fontSize = Math.max(1, Number(textObject.fontSize || 32) * scale);
  const justification = textObject.textAlign === "right" ? "right" : textObject.textAlign === "center" ? "center" : "left";

  return {
    text: textObject.text || "",
    transform: [1, 0, 0, 1, Number(textObject.left || 0), Number(textObject.top || 0)],
    style: {
      font: { name: FONT_POSTSCRIPT_NAMES[fontFamily] || fontFamily.replace(/\s+/g, "") || "ArialMT" },
      fontSize,
      fillColor: cssColorToRgb(textObject.fill),
      fauxBold: textObject.fontWeight === "bold" || Number(textObject.fontWeight) >= 600,
      fauxItalic: textObject.fontStyle === "italic",
    },
    paragraphStyle: { justification },
  };
}

export async function exportFabricCanvasToPsd(source: fabric.Canvas, filename = "zunexi-design.psd") {
  const { writePsd } = await import("ag-psd");
  const objects = source.getObjects();
  const layers: PsdLayer[] = [];

  // PSD stores the visual stack top-to-bottom; Fabric exposes bottom-to-top.
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    const raster = await rasterizeObject(object);
    const text = textMetadata(object);
    layers.push({
      name: layerName(object, index),
      canvas: raster.canvas,
      top: raster.top,
      left: raster.left,
      ...(text ? { text } : {}),
    });
  }

  const background = backgroundLayer(source);
  if (background) layers.push(background);

  const psd = {
    width: source.width || 1,
    height: source.height || 1,
    canvas: canvasComposite(source),
    children: layers,
  };

  const data = writePsd(psd as never, {
    generateThumbnail: true,
    trimImageData: true,
    noBackground: true,
  });
  const blob = new Blob([data], { type: "image/vnd.adobe.photoshop" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith(".psd") ? filename : `${filename}.psd`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
  return true;
}
