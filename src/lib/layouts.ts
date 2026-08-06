// Layouts editoriais para o Fabric.js. A geração de imagem cuida apenas do visual;
// estes descritores montam a tipografia e os elementos gráficos em coordenadas
// lógicas do documento (ex.: 1080x1080), independentemente do zoom do editor.

export type ElementDesc =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; opacity?: number; rx?: number; selectable?: boolean; name?: string; role?: string }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; opacity?: number; selectable?: boolean; name?: string; role?: string }
  | { kind: "image"; x: number; y: number; w: number; h: number; url: string; opacity?: number; selectable?: boolean; name?: string; role?: string }
  | {
      kind: "text";
      x: number;
      y: number;
      w: number;
      text: string;
      size: number;
      color: string;
      align: "left" | "center" | "right";
      weight?: number;
      italic?: boolean;
      shadow?: string;
      font?: string;
      lineHeight?: number;
      charSpacing?: number;
      selectable?: boolean;
      name?: string;
      role?: string;
    };

export interface LayoutInput {
  title: string;
  body?: string;
  imageUrl?: string;
  palette: string[];
  width: number;
  height: number;
  fonts: { display: string; body: string };
}

const rnd = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const px = (value: number) => Math.round(value);

export const LAYOUT_IDS = [
  "text-over-image",
  "side-text",
  "bottom-text",
  "hero-image",
  "center-text",
  "diagonal",
  "menu-board",
] as const;

export type LayoutId = typeof LAYOUT_IDS[number];

export function pickLayout(): LayoutId {
  return rnd([...LAYOUT_IDS]);
}

function estimatedLineCount(text: string, width: number, fontSize: number) {
  const clean = text.trim();
  if (!clean) return 0;
  const charsPerLine = Math.max(4, Math.floor(width / Math.max(1, fontSize * 0.56)));
  return Math.max(1, Math.ceil(clean.length / charsPerLine));
}

function fittedTitleSize(text: string, width: number, max: number, min: number, desiredLines = 2) {
  const cleanLength = Math.max(1, text.trim().length);
  const byLength = (width * desiredLines) / (cleanLength * 0.56);
  return px(clamp(byLength, min, max));
}

function fitTextToLines(text: string, width: number, fontSize: number, maxLines: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const charsPerLine = Math.max(4, Math.floor(width / Math.max(1, fontSize * 0.56)));
  const limit = Math.max(24, charsPerLine * maxLines);
  if (clean.length <= limit) return clean;
  const sample = clean.slice(0, limit + 1);
  const boundary = sample.lastIndexOf(" ");
  return `${sample.slice(0, boundary > limit * 0.65 ? boundary : limit).trim()}…`;
}

function isDenseCopy(title: string, body?: string) {
  const source = `${title}\n${body || ""}`.toLowerCase();
  const lineCount = (body || "").split(/\n+/).filter(Boolean).length;
  return (
    (body || "").length > 240 ||
    lineCount >= 7 ||
    /card[aá]pio|menu|cat[aá]logo|lista|tabela|pre[cç]o|sabores|pizzas|bebidas|tradicionais|doces|promo[cç][aã]o/.test(source)
  );
}

type RichLine = { kind: "heading" | "subheading" | "item" | "meta" | "separator"; text: string };

function cleanMarkdownInline(text: string) {
  return text
    .replace(/^\s*[#>*-]+\s*/g, "")
    .replace(/^\*\*(.*)\*\*$/g, "$1")
    .replace(/^__(.*)__$/g, "$1")
    .trim();
}

function parseRichBody(body: string): RichLine[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const output: RichLine[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-—_]{3,}$/.test(line)) {
      output.push({ kind: "separator", text: "" });
      continue;
    }
    if (/^###\s+/.test(line)) {
      output.push({ kind: "subheading", text: cleanMarkdownInline(line) });
      continue;
    }
    if (/^##\s+/.test(line) || /^#\s+/.test(line)) {
      output.push({ kind: "heading", text: cleanMarkdownInline(line) });
      continue;
    }
    if (/^\*\*.+\*\*$/.test(line)) {
      output.push({ kind: "item", text: cleanMarkdownInline(line) });
      continue;
    }
    if ((line.endsWith(":") || (line === line.toUpperCase() && /[A-ZÁÉÍÓÚÃÕÇ]/.test(line))) && line.length <= 42) {
      output.push({ kind: "heading", text: cleanMarkdownInline(line).replace(/:$/, "") });
      continue;
    }
    if (/^[•●▪◦]/.test(line) || /^\*\s+/.test(line) || /^-\s+/.test(line)) {
      output.push({ kind: "item", text: cleanMarkdownInline(line) });
      continue;
    }
    output.push({ kind: output.length < 2 ? "meta" : "item", text: cleanMarkdownInline(line) });
  }
  return output;
}

function addBrandAccent(els: ElementDesc[], x: number, y: number, width: number, accent: string) {
  els.push({ kind: "rect", x, y, w: width, h: 8, fill: accent, rx: 4, selectable: false });
}

function addLeftScrim(els: ElementDesc[], W: number, H: number) {
  els.push({ kind: "rect", x: 0, y: 0, w: W * 0.68, h: H, fill: "#000000", opacity: 0.22, selectable: false });
  els.push({ kind: "rect", x: 0, y: 0, w: W * 0.55, h: H, fill: "#000000", opacity: 0.20, selectable: false });
  els.push({ kind: "rect", x: 0, y: 0, w: W * 0.43, h: H, fill: "#000000", opacity: 0.18, selectable: false });
}

function addBottomScrim(els: ElementDesc[], W: number, H: number) {
  els.push({ kind: "rect", x: 0, y: H * 0.55, w: W, h: H * 0.45, fill: "#000000", opacity: 0.34, selectable: false });
  els.push({ kind: "rect", x: 0, y: H * 0.67, w: W, h: H * 0.33, fill: "#000000", opacity: 0.26, selectable: false });
}

function addMenuBoardLayout(els: ElementDesc[], input: LayoutInput, bg: string, accent: string) {
  const { title, body, imageUrl, width: W, height: H, fonts } = input;
  const panelFill = luminance(bg) > 0.35 ? "#09090b" : bg;
  if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: "#000000", opacity: 0.42, selectable: false, name: "Sombra geral", role: "scrim" });
  els.push({ kind: "rect", x: 24, y: 24, w: W - 48, h: H - 48, fill: panelFill, opacity: 0.94, rx: 28, selectable: false, name: "Card principal", role: "panel" });
  els.push({ kind: "rect", x: 24, y: 24, w: W - 48, h: H * 0.23, fill: "#000000", opacity: 0.14, rx: 28, selectable: false, name: "Cabeçalho", role: "header" });
  els.push({ kind: "rect", x: 24, y: Math.round(H * 0.24), w: W - 48, h: 2, fill: accent, opacity: 0.85, selectable: false, name: "Divisor", role: "accent" });

  addBrandAccent(els, 64, 72, W * 0.11, accent);

  const titleW = W - 128;
  const titleSize = fittedTitleSize(title, titleW, W * 0.058, W * 0.034, 2);
  els.push({
    kind: "text",
    x: 64,
    y: 96,
    w: titleW,
    text: title,
    size: titleSize,
    color: "#ffffff",
    align: "left",
    weight: 780,
    font: fonts.display,
    lineHeight: 0.96,
    charSpacing: -5,
    name: "Título",
    role: "title",
  });

  let lines = parseRichBody(body || "");
  if (!lines.length && body) lines = [{ kind: "meta", text: body }];

  const contentTop = Math.round(H * 0.285);
  const contentBottom = H - 76;
  const columnGap = 32;
  const useTwoCols = lines.length > 12 || (body || "").length > 560;
  const colCount = useTwoCols ? 2 : 1;
  const colWidth = (W - 128 - (colCount - 1) * columnGap) / colCount;
  const colX = [64, 64 + colWidth + columnGap];
  let col = 0;
  let y = contentTop;

  for (const line of lines) {
    if (line.kind === "separator") {
      y += 12;
      continue;
    }

    if (y > contentBottom - 34 && col < colCount - 1) {
      col += 1;
      y = contentTop;
    }
    if (y > contentBottom - 24) break;

    const size = line.kind === "heading" ? 26 : line.kind === "subheading" ? 21 : line.kind === "meta" ? 20 : 18;
    const weight = line.kind === "item" ? 650 : line.kind === "heading" ? 760 : line.kind === "subheading" ? 720 : 460;
    const color = line.kind === "heading" || line.kind === "subheading" ? accent : "#ffffff";
    const widthLine = colWidth;
    const bullet = line.kind === "item" && !/[—:-]/.test(line.text) ? "• " : "";

    els.push({
      kind: "text",
      x: colX[col],
      y,
      w: widthLine,
      text: `${bullet}${line.text}`,
      size,
      color,
      align: "left",
      weight,
      font: line.kind === "heading" || line.kind === "subheading" ? fonts.display : fonts.body,
      lineHeight: line.kind === "meta" ? 1.18 : 1.12,
      name: line.kind === "heading" || line.kind === "subheading" ? "Seção" : "Texto",
      role: line.kind === "heading" || line.kind === "subheading" ? "section" : "body",
    });

    const heightContribution = estimatedLineCount(line.text, widthLine, size) * size * (line.kind === "meta" ? 1.02 : 0.88);
    y += heightContribution + (line.kind === "heading" ? 16 : line.kind === "subheading" ? 12 : 8);
  }
}

export function buildLayout(id: LayoutId, input: LayoutInput): ElementDesc[] {
  const { title, body, imageUrl, palette, width: W, height: H, fonts } = input;
  const [bg, primary, accent, text] = palette;
  const els: ElementDesc[] = [];
  const P = px(W * 0.065);
  const denseMode = isDenseCopy(title, body);
  const bodySize = px(clamp(denseMode ? W * 0.024 : W * 0.032, denseMode ? 20 : 27, denseMode ? 31 : 38));
  const effectiveId: LayoutId = denseMode ? "menu-board" : id;

  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: bg, selectable: false, name: "Fundo", role: "background" });

  switch (effectiveId) {
    case "menu-board": {
      addMenuBoardLayout(els, input, bg, accent);
      break;
    }

    case "text-over-image": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
      addLeftScrim(els, W, H);
      const boxW = W * 0.47;
      const titleSize = fittedTitleSize(title, boxW, W * 0.086, W * 0.052, 2);
      const titleLines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const titleY = H * 0.25;
      addBrandAccent(els, P, titleY - 28, W * 0.085, accent);
      els.push({ kind: "text", x: P, y: titleY, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 760, font: fonts.display, lineHeight: 0.94, charSpacing: -8, shadow: "soft", name: "Título", role: "title" });
      if (body) {
        const bodyY = titleY + titleLines * titleSize * 0.96 + px(W * 0.032);
        els.push({ kind: "text", x: P, y: bodyY, w: boxW * 0.95, text: fitTextToLines(body, boxW * 0.95, bodySize, 6), size: bodySize, color: "#ffffff", align: "left", weight: 450, font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
      }
      break;
    }

    case "side-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
      els.push({ kind: "rect", x: 0, y: 0, w: W * 0.44, h: H, fill: "#000000", opacity: 0.54, selectable: false, name: "Sombra de leitura", role: "scrim" });
      els.push({ kind: "rect", x: W * 0.44, y: H * 0.13, w: 6, h: H * 0.74, fill: accent, opacity: 0.9, selectable: false, name: "Acento", role: "accent" });
      const boxW = W * 0.33;
      const titleSize = fittedTitleSize(title, boxW, W * 0.068, W * 0.041, 3);
      const lines = Math.min(4, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.24;
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -6, name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize + 30, w: boxW, text: fitTextToLines(body, boxW, bodySize, 8), size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
      break;
    }

    case "bottom-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
      addBottomScrim(els, W, H);
      const boxW = W - 2 * P;
      const titleSize = fittedTitleSize(title, boxW, W * 0.078, W * 0.05, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.67;
      addBrandAccent(els, P, y - 24, W * 0.09, accent);
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 760, font: fonts.display, lineHeight: 0.95, charSpacing: -6, shadow: "soft", name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize * 0.97 + 24, w: W * 0.72, text: fitTextToLines(body, W * 0.72, bodySize, 4), size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
      break;
    }

    case "hero-image": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
      addBottomScrim(els, W, H);
      const boxW = W * 0.7;
      const titleSize = fittedTitleSize(title, boxW, W * 0.072, W * 0.047, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.71;
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -5, shadow: "soft", name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize + 18, w: W * 0.62, text: fitTextToLines(body, W * 0.62, bodySize, 4), size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
      break;
    }

    case "center-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, opacity: 0.82, name: "Imagem principal", role: "hero" });
      els.push({ kind: "rect", x: W * 0.12, y: H * 0.23, w: W * 0.76, h: H * 0.52, fill: "#050505", opacity: 0.62, rx: 32, selectable: false, name: "Painel", role: "panel" });
      const boxW = W * 0.64;
      const titleSize = fittedTitleSize(title, boxW, W * 0.082, W * 0.05, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.34;
      els.push({ kind: "text", x: W * 0.18, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "center", weight: 760, font: fonts.display, lineHeight: 0.96, charSpacing: -5, name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x: W * 0.22, y: y + lines * titleSize + 28, w: W * 0.56, text: fitTextToLines(body, W * 0.56, bodySize, 4), size: bodySize, color: "#ffffff", align: "center", font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
      break;
    }

    case "diagonal": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
      addLeftScrim(els, W, H);
      els.push({ kind: "circle", cx: W * 0.92, cy: H * 0.08, r: W * 0.22, fill: primary, opacity: 0.18, selectable: false, name: "Glow", role: "accent" });
      const boxW = W * 0.49;
      const titleSize = fittedTitleSize(title, boxW, W * 0.078, W * 0.048, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.3;
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 760, font: fonts.display, lineHeight: 0.95, charSpacing: -6, shadow: "soft", name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize + 25, w: boxW, text: fitTextToLines(body, boxW, bodySize, 6), size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
      break;
    }
  }

  return els;
}

export const PALETTES: string[][] = [
  ["#0f0f1a", "#a855f7", "#22d3ee", "#f5f5ff"],
  ["#1a0f14", "#f97316", "#fbbf24", "#fff7ed"],
  ["#0b1220", "#3b82f6", "#22d3ee", "#e6f0ff"],
  ["#0f172a", "#10b981", "#facc15", "#ecfeff"],
  ["#1c0e1a", "#ec4899", "#8b5cf6", "#fdf4ff"],
  ["#111111", "#e5e7eb", "#a3a3a3", "#ffffff"],
  ["#f5f5f0", "#111111", "#ef4444", "#111111"],
  ["#0a0a0a", "#facc15", "#f97316", "#fef3c7"],
];

export const FONT_PAIRS = [
  { display: "Space Grotesk", body: "Inter" },
  { display: "Playfair Display", body: "Inter" },
  { display: "Bebas Neue", body: "Inter" },
  { display: "Archivo Black", body: "Inter" },
  { display: "Syne", body: "Inter" },
  { display: "DM Serif Display", body: "Inter" },
];

export function randomStyle() {
  return { palette: rnd(PALETTES), fonts: rnd(FONT_PAIRS), layout: pickLayout() };
}

const COLOR_KEYWORDS: Array<[RegExp, string]> = [
  [/preto|black|grafite|graphite|dark/i, "#09090b"],
  [/branco|white|gelo|ice/i, "#ffffff"],
  [/azul|blue/i, "#4d6bff"],
  [/ciano|cyan|turquesa|turquoise/i, "#22d3ee"],
  [/roxo|violeta|purple|violet/i, "#8b5cf6"],
  [/rosa|pink/i, "#ec4899"],
  [/vermelho|red/i, "#ef4444"],
  [/laranja|orange/i, "#f97316"],
  [/amarelo|yellow|dourado|gold/i, "#f2c14e"],
  [/verde|green|esmeralda|emerald/i, "#10b981"],
  [/cinza|gray|grey/i, "#71717a"],
  [/bege|beige|creme|cream/i, "#f5f0e6"],
];

function luminance(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return 0;
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function paletteFromDescription(description: string): string[] {
  const explicitHex = description.match(/#[0-9a-f]{6}\b/gi) || [];
  const named = COLOR_KEYWORDS.filter(([pattern]) => pattern.test(description)).map(([, color]) => color);
  const colors = [...explicitHex.map((color) => color.toLowerCase()), ...named]
    .filter((color, index, all) => all.indexOf(color) === index);

  const bg = colors[0] || "#09090b";
  const primary = colors[1] || (luminance(bg) > 0.55 ? "#4d6bff" : "#8b5cf6");
  const accent = colors[2] || (primary.toLowerCase() === "#8b5cf6" ? "#22d3ee" : "#8b5cf6");
  const text = luminance(bg) > 0.55 ? "#111827" : "#ffffff";
  return [bg, primary, accent, text];
}

export function fontPairFromStyle(style: string) {
  const explicit = style.match(/tipografia(?:\s+(?:obrigatória|obrigatoria|oficial))?\s*:\s*([^;\n]+)/i)?.[1];
  if (explicit) {
    const fonts = explicit.split(/[,|/]/).map((font) => font.trim().replace(/["']/g, "")).filter(Boolean).slice(0, 2);
    if (fonts.length) return { display: fonts[0], body: fonts[1] || fonts[0] };
  }
  const value = style.toLowerCase();
  if (/luxo|luxury|elegant|elegante|sofistic|editorial|vintage/.test(value)) {
    return { display: "Playfair Display", body: "Inter" };
  }
  if (/impact|bold|street|festival|esport|sport|vibrante|food|gastron|hamburg/.test(value)) {
    return { display: "Archivo Black", body: "Inter" };
  }
  if (/minimal|clean|corporat|profissional/.test(value)) {
    return { display: "Space Grotesk", body: "Inter" };
  }
  if (/futur|tech|tecnolog|digital|ia|cyber/.test(value)) {
    return { display: "Syne", body: "Inter" };
  }
  return { display: "Space Grotesk", body: "Inter" };
}

export function layoutForSlide(index: number, kind: string, title = "", body = ""): LayoutId {
  const role = kind.toLowerCase();
  if (isDenseCopy(title, body)) return "menu-board";
  if (role.includes("capa")) return "text-over-image";
  if (role.includes("cta")) return "center-text";
  const sequence: LayoutId[] = ["text-over-image", "side-text", "hero-image", "bottom-text", "diagonal"];
  return sequence[Math.max(0, index - 1) % sequence.length];
}

export function compositionForLayout(layout: LayoutId): string {
  switch (layout) {
    case "bottom-text":
      return "Keep the hero subject in the upper 55% with clear separation. Preserve the lower 35% as a darker, calmer copy-safe area without artificial blank panels.";
    case "side-text":
      return "Place the hero subject in the right 55% of the frame. Keep the left 38% visually quiet and darker so typography can sit there without covering the subject.";
    case "hero-image":
      return "Create a strong hero subject in the upper-center/right area with premium negative space and a darker lower-left zone for supporting copy.";
    case "center-text":
      return "Keep the central 60% calm and low-detail for the CTA, while placing atmospheric visual interest and secondary objects around the edges.";
    case "diagonal":
      return "Create dynamic depth moving from bottom-right toward top-right. Keep the left-center 45% calm and dark enough for readable copy.";
    case "menu-board":
      return "Create a rich, appetizing or editorial full-bleed scene with the hero subject visible around the edges and calmer central readability. Keep the middle/lower area clean enough for a dense information card overlay; never create a blank white panel inside the image.";
    case "text-over-image":
    default:
      return "Place the hero subject clearly in the right half, preferably right-center. Keep the left 42% darker, low-detail and naturally empty for a two-line headline and supporting text.";
  }
}
