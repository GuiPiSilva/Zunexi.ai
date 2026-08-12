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
  cta?: string;
  imageUrl?: string;
  palette: string[];
  width: number;
  height: number;
  fonts: { display: string; body: string };
  slideNumber?: number;
  slideTotal?: number;
  brandName?: string;
  theme?: string;
  styleHint?: string;
}

const rnd = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const px = (value: number) => Math.round(value);

function stableVariant(value: string, count: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, count);
}

export const LAYOUT_IDS = [
  "text-over-image",
  "side-text",
  "bottom-text",
  "hero-image",
  "center-text",
  "diagonal",
  "menu-board",
  "social-hero",
  "social-editorial",
  "social-workflow",
  "social-feature-grid",
  "social-cards",
  "social-minimal",
  "social-cta",
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

function campaignSource(input: LayoutInput) {
  return `${input.brandName || ""}
${input.theme || ""}
${input.title}
${input.body || ""}
${input.styleHint || ""}`.toLowerCase();
}

function isTechCampaign(input: LayoutInput) {
  return /zunexi|\bia\b|artificial|software|saas|plataforma|sistema|app|aplicativo|conte[uú]do|cri(a|á)r|carrossel|post|branding|agenda|publica[cç][aã]o|calend[aá]rio|analytics|automa[cç][aã]o|templates?|legendas?|copy|marketing/.test(campaignSource(input));
}

function isFoodCampaign(input: LayoutInput) {
  return /hamb|burger|food|comida|restaurante|lanche|pizza|sorvet|bebida|drink|caf[eé]|gastron|card[aá]pio|menu|combo|artesanal|bacon|cheddar|batata/.test(campaignSource(input));
}

function slideCounter(input: LayoutInput) {
  if (!input.slideNumber || !input.slideTotal) return "";
  return `${String(input.slideNumber).padStart(2, "0")}/${String(input.slideTotal).padStart(2, "0")}`;
}

function cleanBrandName(input: LayoutInput) {
  return (input.brandName || "").trim();
}

function techBodyChunks(body: string | undefined, limit = 4) {
  const raw = String(body || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.replace(/^[•\-–—]\s*/, "").trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const item of raw) {
    if (!unique.includes(item)) unique.push(item);
  }
  return unique.slice(0, limit);
}

function addTechHeader(els: ElementDesc[], input: LayoutInput, dark: boolean, accent: string) {
  const brand = cleanBrandName(input);
  const counter = slideCounter(input);
  if (brand) {
    els.push({ kind: "text", x: 62, y: 76, w: 520, text: brand, size: 32, color: dark ? "#f8fafc" : "#111827", align: "left", weight: 760, font: input.fonts.display, lineHeight: 1, charSpacing: -2, name: "Marca", role: "brand" });
  }
  if (counter) {
    els.push({ kind: "text", x: input.width - 200, y: 76, w: 140, text: counter, size: 28, color: dark ? accent : accent, align: "right", weight: 700, font: input.fonts.body, lineHeight: 1, name: "Contador", role: "meta" });
  }
}

function addTechPill(els: ElementDesc[], x: number, y: number, w: number, text: string, dark: boolean, accent: string, fonts: { display: string; body: string }) {
  els.push({ kind: "rect", x, y, w, h: 92, fill: dark ? "#ffffff" : "#ffffff", opacity: dark ? 0.16 : 0.9, rx: 28, selectable: false, name: "Card", role: "panel" });
  if (!dark) els.push({ kind: "rect", x, y: y + 90, w, h: 2, fill: "#e5e7eb", selectable: false, name: "Base", role: "separator" });
  els.push({ kind: "circle", cx: x + 34, cy: y + 46, r: 10, fill: accent, selectable: false, name: "Marcador", role: "accent" });
  els.push({ kind: "text", x: x + 58, y: y + 56, w: w - 78, text: fitTextToLines(text, w - 78, 24, 2), size: 24, color: dark ? "#ffffff" : "#111827", align: "left", weight: 560, font: fonts.body, lineHeight: 1.08, name: "Item", role: "body" });
}

function addTechShowcase(els: ElementDesc[], x: number, y: number, w: number, h: number, imageUrl: string | undefined, accent: string, dark: boolean) {
  els.push({ kind: "rect", x, y, w, h, fill: dark ? "#0b1020" : "#eef2ff", opacity: 0.92, rx: 34, selectable: false, name: "Mockup", role: "panel" });
  els.push({ kind: "rect", x: x + 18, y: y + 18, w: w - 36, h: h - 36, fill: dark ? "#0f172a" : "#ffffff", opacity: 0.96, rx: 26, selectable: false, name: "Tela", role: "panel" });
  if (imageUrl) {
    els.push({ kind: "image", x: x + 36, y: y + 72, w: w - 72, h: h - 130, url: imageUrl, name: "Visual", role: "hero" });
  } else {
    els.push({ kind: "rect", x: x + 40, y: y + 86, w: w - 80, h: 22, fill: accent, opacity: 0.18, rx: 11, selectable: false, name: "Barra", role: "accent" });
    els.push({ kind: "rect", x: x + 40, y: y + 126, w: w * 0.42, h: 150, fill: accent, opacity: 0.16, rx: 20, selectable: false, name: "Card 1", role: "panel" });
    els.push({ kind: "rect", x: x + 40 + w * 0.46, y: y + 126, w: w * 0.32, h: 150, fill: dark ? "#111827" : "#e0e7ff", opacity: 0.92, rx: 20, selectable: false, name: "Card 2", role: "panel" });
    els.push({ kind: "rect", x: x + 40, y: y + 298, w: w - 80, h: 170, fill: dark ? "#111827" : "#f8fafc", opacity: 0.95, rx: 24, selectable: false, name: "Grid", role: "panel" });
  }
  els.push({ kind: "circle", cx: x + 52, cy: y + 44, r: 5, fill: "#fb7185", selectable: false, name: "Dot", role: "accent" });
  els.push({ kind: "circle", cx: x + 70, cy: y + 44, r: 5, fill: "#facc15", selectable: false, name: "Dot", role: "accent" });
  els.push({ kind: "circle", cx: x + 88, cy: y + 44, r: 5, fill: "#34d399", selectable: false, name: "Dot", role: "accent" });
}

function buildTechLayout(id: LayoutId, input: LayoutInput): ElementDesc[] {
  const { title, body, cta, imageUrl, palette, width: W, height: H, fonts } = input;
  const [bg, primary, accent, text] = palette;
  const els: ElementDesc[] = [];
  const dark = (input.slideNumber || 1) % 2 === 1;
  const bgColor = dark ? (bg || "#0a0f1f") : "#f6f7fb";
  const textColor = dark ? "#f8fafc" : "#0f172a";
  const secondaryText = dark ? "rgba(248,250,252,0.88)" : "#334155";
  const brandAccent = accent || primary || "#8b5cf6";
  const limeAccent = dark ? brandAccent : primary || brandAccent;
  const pagePad = 64;

  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: bgColor, selectable: false, name: "Fundo", role: "background" });
  els.push({ kind: "circle", cx: W * 0.92, cy: H * 0.12, r: W * 0.18, fill: brandAccent, opacity: dark ? 0.16 : 0.08, selectable: false, name: "Glow", role: "accent" });
  els.push({ kind: "circle", cx: W * 0.08, cy: H * 0.9, r: W * 0.13, fill: primary || brandAccent, opacity: dark ? 0.14 : 0.06, selectable: false, name: "Glow", role: "accent" });
  addTechHeader(els, input, dark, brandAccent);

  const chunks = techBodyChunks(body, 4);
  const titleWidth = W * 0.72;

  if (id === "center-text") {
    const titleSize = fittedTitleSize(title, W * 0.7, W * 0.09, W * 0.05, 3);
    els.push({ kind: "text", x: W * 0.15, y: H * 0.27, w: W * 0.7, text: title, size: titleSize, color: textColor, align: "center", weight: 780, font: fonts.display, lineHeight: 0.95, charSpacing: -5, name: "Título", role: "title" });
    if (body) {
      els.push({ kind: "text", x: W * 0.22, y: H * 0.52, w: W * 0.56, text: fitTextToLines(body, W * 0.56, 30, 4), size: 30, color: secondaryText, align: "center", weight: 450, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
    }
    if (cta) {
      els.push({ kind: "rect", x: W * 0.23, y: H * 0.74, w: W * 0.54, h: 92, fill: primary || brandAccent, rx: 46, selectable: false, name: "CTA", role: "accent" });
      els.push({ kind: "text", x: W * 0.26, y: H * 0.8, w: W * 0.48, text: fitTextToLines(cta, W * 0.48, 34, 1), size: 34, color: dark ? "#ffffff" : "#0f172a", align: "center", weight: 700, font: fonts.display, lineHeight: 1, name: "CTA texto", role: "body" });
    }
    return els;
  }

  if (id === "hero-image") {
    const titleSize = fittedTitleSize(title, W * 0.42, W * 0.072, W * 0.045, 3);
    els.push({ kind: "text", x: pagePad, y: H * 0.22, w: W * 0.42, text: title, size: titleSize, color: textColor, align: "left", weight: 770, font: fonts.display, lineHeight: 0.95, charSpacing: -4, name: "Título", role: "title" });
    if (body) {
      els.push({ kind: "text", x: pagePad, y: H * 0.47, w: W * 0.36, text: fitTextToLines(body, W * 0.36, 28, 5), size: 28, color: secondaryText, align: "left", weight: 440, font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
    }
    addTechShowcase(els, W * 0.52, H * 0.18, W * 0.36, H * 0.54, imageUrl, brandAccent, dark);
    const stats = chunks.slice(0, 3);
    stats.forEach((item, index) => {
      const x = pagePad + index * (W * 0.25);
      els.push({ kind: "rect", x, y: H * 0.78, w: W * 0.21, h: 120, fill: dark ? "#0f172a" : "#ffffff", opacity: 0.96, rx: 24, selectable: false, name: "Métrica", role: "panel" });
      els.push({ kind: "text", x: x + 20, y: H * 0.82, w: W * 0.17, text: fitTextToLines(item, W * 0.17, 22, 2), size: 22, color: textColor, align: "left", weight: 650, font: fonts.body, lineHeight: 1.08, name: "Métrica", role: "body" });
    });
    return els;
  }

  if (id === "bottom-text") {
    const titleSize = fittedTitleSize(title, W * 0.82, W * 0.082, W * 0.048, 3);
    if (imageUrl) addTechShowcase(els, W * 0.2, H * 0.11, W * 0.6, H * 0.34, imageUrl, brandAccent, dark);
    els.push({ kind: "text", x: pagePad, y: H * 0.56, w: W * 0.78, text: title, size: titleSize, color: textColor, align: "left", weight: 780, font: fonts.display, lineHeight: 0.95, charSpacing: -4, name: "Título", role: "title" });
    if (body) els.push({ kind: "text", x: pagePad, y: H * 0.7, w: W * 0.74, text: fitTextToLines(body, W * 0.74, 30, 4), size: 30, color: secondaryText, align: "left", weight: 440, font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
    return els;
  }

  if (id === "side-text" || id === "diagonal") {
    const titleSize = fittedTitleSize(title, W * 0.56, W * 0.08, W * 0.046, 3);
    els.push({ kind: "text", x: pagePad, y: H * 0.2, w: W * 0.56, text: title, size: titleSize, color: textColor, align: "left", weight: 780, font: fonts.display, lineHeight: 0.95, charSpacing: -5, name: "Título", role: "title" });
    if (body) els.push({ kind: "text", x: pagePad, y: H * 0.38, w: W * 0.52, text: fitTextToLines(body, W * 0.52, 28, 4), size: 28, color: secondaryText, align: "left", weight: 440, font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
    const pillItems = chunks;
    pillItems.slice(0, 4).forEach((item, index) => addTechPill(els, pagePad, H * 0.54 + index * 108, W * 0.62, item, dark, brandAccent, fonts));
    if (imageUrl && id === "diagonal") addTechShowcase(els, W * 0.62, H * 0.54, W * 0.26, H * 0.24, imageUrl, brandAccent, dark);
    return els;
  }

  // cover / default tech slide
  const titleSize = fittedTitleSize(title, titleWidth, W * 0.095, W * 0.058, 3);
  els.push({ kind: "text", x: pagePad, y: H * 0.22, w: titleWidth, text: title, size: titleSize, color: textColor, align: "left", weight: 800, font: fonts.display, lineHeight: 0.93, charSpacing: -6, name: "Título", role: "title" });
  addBrandAccent(els, pagePad, H * 0.19, W * 0.12, brandAccent);
  if (body) els.push({ kind: "text", x: pagePad, y: H * 0.68, w: W * 0.48, text: fitTextToLines(body, W * 0.48, 30, 4), size: 30, color: secondaryText, align: "left", weight: 440, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
  if (imageUrl) {
    addTechShowcase(els, W * 0.56, H * 0.44, W * 0.3, H * 0.34, imageUrl, brandAccent, dark);
  } else {
    els.push({ kind: "rect", x: W * 0.68, y: H * 0.76, w: W * 0.22, h: 4, fill: brandAccent, selectable: false, name: "Acento", role: "accent" });
  }
  return els;
}

function shortBodyItems(body: string | undefined, wanted: number) {
  const source = String(body || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.replace(/^[•\-–—\d.)\s]+/, "").trim())
    .filter(Boolean);
  const output: string[] = [];
  for (const item of source) {
    const clean = fitTextToLines(item, 360, 25, 2);
    if (clean && !output.includes(clean)) output.push(clean);
  }
  return output.slice(0, wanted);
}

function addSocialHeader(
  els: ElementDesc[],
  input: LayoutInput,
  textColor: string,
  accent: string,
) {
  const brand = cleanBrandName(input);
  const counter = slideCounter(input);
  if (brand) {
    els.push({
      kind: "text",
      x: 64,
      y: 64,
      w: input.width * 0.55,
      text: brand,
      size: 30,
      color: textColor,
      align: "left",
      weight: 760,
      font: input.fonts.display,
      lineHeight: 1,
      charSpacing: -2,
      name: "Marca",
      role: "brand",
    });
  }
  if (counter) {
    els.push({
      kind: "text",
      x: input.width - 210,
      y: 64,
      w: 146,
      text: counter,
      size: 26,
      color: accent,
      align: "right",
      weight: 720,
      font: input.fonts.body,
      lineHeight: 1,
      name: "Contador",
      role: "meta",
    });
  }
}

function addDotCluster(
  els: ElementDesc[],
  x: number,
  y: number,
  accent: string,
  columns = 5,
  rows = 4,
  gap = 22,
) {
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      els.push({
        kind: "circle",
        cx: x + col * gap,
        cy: y + row * gap,
        r: 4,
        fill: accent,
        opacity: 0.85,
        selectable: false,
        name: "Ponto",
        role: "accent",
      });
    }
  }
}

function addSocialCard(
  els: ElementDesc[],
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fill: string,
  textColor: string,
  accent: string,
  fonts: { display: string; body: string },
  index: number,
) {
  els.push({ kind: "rect", x, y, w, h, fill, opacity: 0.98, rx: 28, selectable: false, name: "Card", role: "panel" });
  els.push({ kind: "circle", cx: x + 46, cy: y + 48, r: 22, fill: accent, opacity: 0.92, selectable: false, name: "Ícone", role: "accent" });
  els.push({ kind: "text", x: x + 32, y: y + 59, w: 28, text: String(index + 1), size: 20, color: "#ffffff", align: "center", weight: 800, font: fonts.body, lineHeight: 1, name: "Número", role: "meta" });
  els.push({ kind: "text", x: x + 78, y: y + 58, w: w - 104, text: fitTextToLines(text, w - 104, 24, 2), size: 24, color: textColor, align: "left", weight: 640, font: fonts.body, lineHeight: 1.08, name: "Item", role: "body" });
}

function buildSocialLayout(id: LayoutId, input: LayoutInput): ElementDesc[] {
  const { title, body, cta, imageUrl, palette, width: W, height: H, fonts } = input;
  const [bg, primary, accent] = palette;
  const slide = input.slideNumber || 1;
  const brandAccent = accent || primary || "#7c3aed";
  const primaryAccent = primary || "#4d6bff";
  const darkBase = luminance(bg || "#09090b") < 0.42 ? (bg || "#09090b") : "#0a0b12";
  const lightBase = "#f7f7f4";
  const ctaVariant = id === "social-cta"
    ? stableVariant(`${input.theme || ""}|${input.brandName || ""}|${title}|${body || ""}|${cta || ""}`, 3)
    : 0;
  const dark = id === "social-hero" || id === "social-cards" || id === "social-feature-grid"
    ? true
    : id === "social-workflow" || id === "social-cta"
      ? id === "social-cta" && ctaVariant === 1
      : slide % 2 === 1;
  const minimalBrandSurface = id === "social-minimal" && slide % 3 === 0 ? primaryAccent : undefined;
  const ctaBrandSurface = id === "social-cta" && ctaVariant === 2 ? primaryAccent : undefined;
  const background = ctaBrandSurface || minimalBrandSurface || (dark ? darkBase : lightBase);
  const surfaceDark = (ctaBrandSurface || minimalBrandSurface)
    ? luminance(ctaBrandSurface || minimalBrandSurface || darkBase) < 0.52
    : dark;
  const textColor = surfaceDark ? "#ffffff" : "#0f172a";
  const secondary = surfaceDark ? "#e5e7eb" : "#334155";
  const els: ElementDesc[] = [];

  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: background, selectable: false, name: "Fundo", role: "background" });
  if (id !== "social-minimal") {
    els.push({ kind: "circle", cx: W * 0.92, cy: H * 0.12, r: W * 0.2, fill: primaryAccent, opacity: dark ? 0.12 : 0.06, selectable: false, name: "Glow", role: "accent" });
    els.push({ kind: "circle", cx: W * 0.06, cy: H * 0.92, r: W * 0.16, fill: brandAccent, opacity: dark ? 0.1 : 0.05, selectable: false, name: "Glow", role: "accent" });
  }
  addSocialHeader(els, input, textColor, brandAccent);

  if (id === "social-minimal") {
    const titleSize = fittedTitleSize(title, W * 0.66, W * 0.1, W * 0.056, 3);
    els.push({ kind: "text", x: W * 0.17, y: H * 0.36, w: W * 0.66, text: title, size: titleSize, color: textColor, align: "center", weight: 820, font: fonts.display, lineHeight: 0.92, charSpacing: -7, name: "Título", role: "title" });
    els.push({ kind: "rect", x: W * 0.4, y: H * 0.59, w: W * 0.2, h: 7, fill: brandAccent, rx: 4, selectable: false, name: "Sublinhado", role: "accent" });
    if (body) els.push({ kind: "text", x: W * 0.24, y: H * 0.66, w: W * 0.52, text: fitTextToLines(body, W * 0.52, 26, 2), size: 26, color: secondary, align: "center", weight: 430, font: fonts.body, lineHeight: 1.14, name: "Texto", role: "body" });
    addDotCluster(els, W * 0.07, H * 0.86, brandAccent, 5, 4, 20);
    return els;
  }

  if (id === "social-cta") {
    if (ctaVariant === 1) {
      const titleSize = fittedTitleSize(title, W * 0.57, W * 0.084, W * 0.048, 3);
      els.push({ kind: "rect", x: W * 0.72, y: H * 0.3, w: W * 0.2, h: H * 0.34, fill: brandAccent, opacity: 0.16, rx: 42, selectable: false, name: "Painel visual", role: "panel" });
      els.push({ kind: "circle", cx: W * 0.82, cy: H * 0.47, r: W * 0.07, fill: brandAccent, opacity: 0.9, selectable: false, name: "Selo", role: "accent" });
      els.push({ kind: "text", x: 72, y: H * 0.25, w: W * 0.57, text: title, size: titleSize, color: textColor, align: "left", weight: 820, font: fonts.display, lineHeight: 0.93, charSpacing: -6, name: "Título", role: "title" });
      addBrandAccent(els, 72, H * 0.22, W * 0.12, brandAccent);
      if (body) els.push({ kind: "text", x: 72, y: H * 0.57, w: W * 0.56, text: fitTextToLines(body, W * 0.56, 29, 4), size: 29, color: secondary, align: "left", weight: 440, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
      if (cta) {
        els.push({ kind: "rect", x: 72, y: H * 0.8, w: W * 0.38, h: 88, fill: brandAccent, rx: 44, selectable: false, name: "CTA", role: "accent" });
        els.push({ kind: "text", x: 96, y: H * 0.854, w: W * 0.335, text: fitTextToLines(cta, W * 0.335, 28, 1), size: 28, color: "#ffffff", align: "center", weight: 780, font: fonts.display, lineHeight: 1, name: "CTA texto", role: "body" });
      }
      return els;
    }

    if (ctaVariant === 2) {
      const panelFill = surfaceDark ? "#ffffff" : darkBase;
      const panelText = surfaceDark ? "#0f172a" : "#ffffff";
      const panelSecondary = surfaceDark ? "#334155" : "#e5e7eb";
      els.push({ kind: "rect", x: W * 0.08, y: H * 0.2, w: W * 0.84, h: H * 0.66, fill: panelFill, opacity: 0.96, rx: 46, selectable: false, name: "Card final", role: "panel" });
      const titleSize = fittedTitleSize(title, W * 0.68, W * 0.082, W * 0.048, 3);
      els.push({ kind: "text", x: W * 0.16, y: H * 0.3, w: W * 0.68, text: title, size: titleSize, color: panelText, align: "center", weight: 820, font: fonts.display, lineHeight: 0.93, charSpacing: -5, name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x: W * 0.2, y: H * 0.55, w: W * 0.6, text: fitTextToLines(body, W * 0.6, 27, 3), size: 27, color: panelSecondary, align: "center", weight: 440, font: fonts.body, lineHeight: 1.15, name: "Texto", role: "body" });
      if (cta) {
        els.push({ kind: "rect", x: W * 0.27, y: H * 0.72, w: W * 0.46, h: 84, fill: brandAccent, rx: 42, selectable: false, name: "CTA", role: "accent" });
        els.push({ kind: "text", x: W * 0.3, y: H * 0.772, w: W * 0.4, text: fitTextToLines(cta, W * 0.4, 28, 1), size: 28, color: "#ffffff", align: "center", weight: 780, font: fonts.display, lineHeight: 1, name: "CTA texto", role: "body" });
      }
      return els;
    }

    const titleSize = fittedTitleSize(title, W * 0.72, W * 0.082, W * 0.048, 3);
    els.push({ kind: "text", x: W * 0.14, y: H * 0.28, w: W * 0.72, text: title, size: titleSize, color: textColor, align: "center", weight: 800, font: fonts.display, lineHeight: 0.94, charSpacing: -5, name: "Título", role: "title" });
    els.push({ kind: "rect", x: W * 0.39, y: H * 0.57, w: W * 0.22, h: 7, fill: brandAccent, rx: 4, selectable: false, name: "Acento", role: "accent" });
    if (body) els.push({ kind: "text", x: W * 0.22, y: H * 0.64, w: W * 0.56, text: fitTextToLines(body, W * 0.56, 28, 3), size: 28, color: secondary, align: "center", weight: 440, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
    if (cta) {
      els.push({ kind: "rect", x: W * 0.24, y: H * 0.82, w: W * 0.52, h: 92, fill: brandAccent, rx: 46, selectable: false, name: "CTA", role: "accent" });
      els.push({ kind: "text", x: W * 0.28, y: H * 0.877, w: W * 0.44, text: fitTextToLines(cta, W * 0.44, 30, 1), size: 30, color: "#ffffff", align: "center", weight: 780, font: fonts.display, lineHeight: 1, name: "CTA texto", role: "body" });
    }
    return els;
  }

  if (id === "social-workflow") {
    const items = shortBodyItems(body, 3);
    const structured = items.length >= 2;
    const titleSize = fittedTitleSize(title, W * 0.74, W * 0.077, W * 0.046, 2);
    els.push({ kind: "text", x: 72, y: H * 0.2, w: W * 0.74, text: title, size: titleSize, color: textColor, align: "left", weight: 800, font: fonts.display, lineHeight: 0.95, charSpacing: -5, name: "Título", role: "title" });
    addBrandAccent(els, 72, H * 0.18, W * 0.13, brandAccent);
    if (body && !structured) els.push({ kind: "text", x: 72, y: H * 0.42, w: W * 0.72, text: fitTextToLines(body, W * 0.72, 28, 3), size: 28, color: secondary, align: "left", weight: 430, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
    const labels = structured ? items : [];
    const y = H * 0.72;
    const xs = labels.map((_, index) => labels.length === 1 ? W * 0.5 : W * (0.2 + (0.6 * index) / (labels.length - 1)));
    xs.forEach((cx, index) => {
      els.push({ kind: "circle", cx, cy: y, r: 76, fill: index === 1 ? brandAccent : "#ece9ff", opacity: 0.98, selectable: false, name: "Etapa", role: "panel" });
      els.push({ kind: "text", x: cx - 30, y: y + 12, w: 60, text: String(index + 1), size: 28, color: index === 1 ? "#ffffff" : brandAccent, align: "center", weight: 800, font: fonts.display, lineHeight: 1, name: "Etapa", role: "meta" });
      els.push({ kind: "text", x: cx - 120, y: y + 120, w: 240, text: fitTextToLines(labels[index] || "", 240, 23, 2), size: 23, color: textColor, align: "center", weight: 620, font: fonts.body, lineHeight: 1.08, name: "Rótulo", role: "body" });
      if (index < xs.length - 1) {
        els.push({ kind: "rect", x: cx + 86, y: y - 2, w: Math.max(24, xs[index + 1] - cx - 172), h: 4, fill: brandAccent, opacity: 0.5, rx: 2, selectable: false, name: "Conector", role: "accent" });
      }
    });
    return els;
  }

  if (id === "social-feature-grid") {
    const items = shortBodyItems(body, 4);
    const structured = items.length >= 2;
    const titleSize = fittedTitleSize(title, W * 0.72, W * 0.076, W * 0.045, 3);
    els.push({ kind: "text", x: 72, y: H * 0.19, w: W * 0.72, text: title, size: titleSize, color: textColor, align: "left", weight: 800, font: fonts.display, lineHeight: 0.94, charSpacing: -5, name: "Título", role: "title" });
    addBrandAccent(els, 72, H * 0.17, W * 0.11, brandAccent);
    if (body && !structured) els.push({ kind: "text", x: 72, y: H * 0.43, w: W * 0.72, text: fitTextToLines(body, W * 0.72, 27, 3), size: 27, color: secondary, align: "left", weight: 430, font: fonts.body, lineHeight: 1.15, name: "Texto", role: "body" });
    const list = structured ? items : [];
    const cardW = W * 0.39;
    const cardH = H * 0.14;
    list.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 72 + col * (cardW + W * 0.055);
      const y = H * 0.62 + row * (cardH + H * 0.035);
      const cardFill = dark ? (index % 2 === 0 ? "#11182a" : "#151a2c") : "#ffffff";
      addSocialCard(els, x, y, cardW, cardH, item, cardFill, dark ? "#ffffff" : "#111827", index % 2 === 0 ? brandAccent : primaryAccent, fonts, index);
    });
    return els;
  }

  if (id === "social-cards") {
    const items = shortBodyItems(body, 3);
    const structured = items.length >= 2;
    const titleSize = fittedTitleSize(title, W * 0.76, W * 0.078, W * 0.047, 2);
    els.push({ kind: "text", x: 72, y: H * 0.2, w: W * 0.76, text: title, size: titleSize, color: textColor, align: "left", weight: 800, font: fonts.display, lineHeight: 0.94, charSpacing: -5, name: "Título", role: "title" });
    if (body && !structured) els.push({ kind: "text", x: 72, y: H * 0.42, w: W * 0.72, text: fitTextToLines(body, W * 0.72, 27, 3), size: 27, color: secondary, align: "left", weight: 430, font: fonts.body, lineHeight: 1.15, name: "Texto", role: "body" });
    const list = structured ? items : [];
    const cardW = list.length === 2 ? W * 0.38 : W * 0.26;
    const totalCardsWidth = list.length * cardW + Math.max(0, list.length - 1) * W * 0.04;
    const startX = (W - totalCardsWidth) / 2;
    list.forEach((item, index) => {
      const x = startX + index * (cardW + W * 0.04);
      const y = H * (0.64 + (index % 2) * 0.035);
      els.push({ kind: "rect", x, y, w: cardW, h: H * 0.25, fill: index === 1 ? "#f8fafc" : index === 2 ? primaryAccent : "#0e172a", opacity: 0.98, rx: 28, selectable: false, name: "Card", role: "panel" });
      els.push({ kind: "rect", x: x + 24, y: y + 24, w: cardW - 48, h: 6, fill: brandAccent, rx: 3, selectable: false, name: "Acento", role: "accent" });
      els.push({ kind: "text", x: x + 26, y: y + 84, w: cardW - 52, text: fitTextToLines(item, cardW - 52, 26, 4), size: 26, color: index === 1 ? "#111827" : "#ffffff", align: "left", weight: 680, font: fonts.display, lineHeight: 1.02, name: "Texto card", role: "body" });
    });
    return els;
  }

  if (id === "social-hero") {
    if (imageUrl) {
      els.push({ kind: "image", x: W * 0.5, y: H * 0.12, w: W * 0.5, h: H * 0.72, url: imageUrl, name: "Imagem principal", role: "hero" });
      els.push({ kind: "rect", x: W * 0.48, y: 0, w: W * 0.22, h: H, fill: background, opacity: 0.45, selectable: false, name: "Transição", role: "scrim" });
    } else {
      addTechShowcase(els, W * 0.57, H * 0.24, W * 0.34, H * 0.45, undefined, brandAccent, true);
    }
    const titleSize = fittedTitleSize(title, W * 0.49, W * 0.082, W * 0.049, 3);
    els.push({ kind: "text", x: 62, y: H * 0.2, w: W * 0.49, text: title, size: titleSize, color: textColor, align: "left", weight: 820, font: fonts.display, lineHeight: 0.92, charSpacing: -6, shadow: "soft", name: "Título", role: "title" });
    addBrandAccent(els, 62, H * 0.18, W * 0.1, brandAccent);
    if (body) els.push({ kind: "text", x: 62, y: H * 0.53, w: W * 0.42, text: fitTextToLines(body, W * 0.42, 27, 5), size: 27, color: secondary, align: "left", weight: 440, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
    if (cta) {
      els.push({ kind: "rect", x: 62, y: H * 0.78, w: W * 0.34, h: 82, fill: brandAccent, rx: 41, selectable: false, name: "CTA", role: "accent" });
      els.push({ kind: "text", x: 84, y: H * 0.832, w: W * 0.3, text: fitTextToLines(cta, W * 0.3, 27, 1), size: 27, color: "#ffffff", align: "center", weight: 760, font: fonts.display, lineHeight: 1, name: "CTA texto", role: "body" });
    }
    return els;
  }

  // social-editorial
  const titleSize = fittedTitleSize(title, W * 0.8, W * 0.092, W * 0.052, 3);
  els.push({ kind: "text", x: 68, y: H * 0.24, w: W * 0.8, text: title, size: titleSize, color: textColor, align: "left", weight: 820, font: fonts.display, lineHeight: 0.93, charSpacing: -6, name: "Título", role: "title" });
  addBrandAccent(els, 68, H * 0.21, W * 0.12, brandAccent);
  if (body) els.push({ kind: "text", x: 68, y: H * 0.58, w: W * 0.66, text: fitTextToLines(body, W * 0.66, 30, 4), size: 30, color: secondary, align: "left", weight: 440, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
  addDotCluster(els, W * 0.8, H * 0.74, brandAccent, 6, 6, 18);
  els.push({ kind: "rect", x: W * 0.92, y: H * 0.18, w: 7, h: H * 0.46, fill: primaryAccent, opacity: 0.78, rx: 4, selectable: false, name: "Linha editorial", role: "accent" });
  els.push({ kind: "circle", cx: W * 0.86, cy: H * 0.61, r: W * 0.09, fill: primaryAccent, opacity: 0.12, selectable: false, name: "Forma", role: "accent" });
  return els;
}

export function layoutNeedsGeneratedImage(id: LayoutId) {
  return ["text-over-image", "side-text", "bottom-text", "hero-image", "diagonal", "menu-board", "social-hero"].includes(id);
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

type FoodLayoutVariant = "cover" | "editorial" | "feature" | "detail" | "minimal" | "cta" | "menu";

function foodVariantForLayout(id: LayoutId, input: LayoutInput): FoodLayoutVariant {
  if (id === "menu-board") return "menu";
  if (id === "social-cta" || id === "center-text") return "cta";
  if (id === "social-minimal") return "minimal";
  if (id === "social-workflow" || id === "social-feature-grid" || id === "side-text") return "feature";
  if (id === "social-cards" || id === "bottom-text") return "detail";
  if (id === "social-editorial" || id === "diagonal") return "editorial";
  if (id === "social-hero" || id === "text-over-image") return "cover";
  if ((input.slideNumber || 1) === (input.slideTotal || -1)) return "cta";
  return "cover";
}

function foodAccentColor(input: LayoutInput) {
  const [, primary, accent] = input.palette;
  const candidates = [primary, accent].filter(Boolean);
  return candidates.find((color) => {
    const light = luminance(color);
    return light > 0.16 && light < 0.86;
  }) || primary || accent || "#d59a2e";
}

function addFoodFrame(els: ElementDesc[], W: number, H: number, accent: string) {
  const inset = 26;
  const thickness = 3;
  const horizontal = W - inset * 2;
  const vertical = H - inset * 2;
  els.push({ kind: "rect", x: inset, y: inset, w: horizontal, h: thickness, fill: accent, opacity: 0.9, selectable: false, name: "Moldura", role: "accent" });
  els.push({ kind: "rect", x: inset, y: H - inset - thickness, w: horizontal, h: thickness, fill: accent, opacity: 0.9, selectable: false, name: "Moldura", role: "accent" });
  els.push({ kind: "rect", x: inset, y: inset, w: thickness, h: vertical, fill: accent, opacity: 0.9, selectable: false, name: "Moldura", role: "accent" });
  els.push({ kind: "rect", x: W - inset - thickness, y: inset, w: thickness, h: vertical, fill: accent, opacity: 0.9, selectable: false, name: "Moldura", role: "accent" });
  els.push({ kind: "rect", x: inset, y: inset + 24, w: 72, h: thickness + 1, fill: accent, selectable: false, name: "Canto", role: "accent" });
  els.push({ kind: "rect", x: W - inset - 72, y: H - inset - 28, w: 72, h: thickness + 1, fill: accent, selectable: false, name: "Canto", role: "accent" });
}

function addFoodHeader(els: ElementDesc[], input: LayoutInput, accent: string, color = "#ffffff") {
  const brand = cleanBrandName(input);
  const counter = slideCounter(input);
  if (brand) {
    els.push({ kind: "text", x: 58, y: 54, w: input.width * 0.56, text: brand.toUpperCase(), size: 27, color, align: "left", weight: 800, font: input.fonts.display, lineHeight: 1, charSpacing: 90, name: "Marca", role: "brand" });
  }
  if (counter) {
    els.push({ kind: "text", x: input.width - 210, y: 54, w: 150, text: counter, size: 24, color: accent, align: "right", weight: 760, font: input.fonts.body, lineHeight: 1, charSpacing: 40, name: "Contador", role: "meta" });
  }
  els.push({ kind: "rect", x: 58, y: 96, w: input.width - 116, h: 2, fill: accent, opacity: 0.72, selectable: false, name: "Linha superior", role: "accent" });
}

function addFoodCta(els: ElementDesc[], input: LayoutInput, x: number, y: number, width: number, accent: string, centered = false) {
  if (!input.cta?.trim()) return;
  els.push({ kind: "rect", x, y, w: width, h: 78, fill: accent, rx: 16, selectable: false, name: "CTA", role: "accent" });
  els.push({ kind: "text", x: x + 24, y: y + 24, w: width - 48, text: fitTextToLines(input.cta.trim(), width - 48, 27, 1), size: 27, color: luminance(accent) > 0.46 ? "#090909" : "#ffffff", align: centered ? "center" : "left", weight: 800, font: input.fonts.display, lineHeight: 1, charSpacing: 20, name: "CTA texto", role: "body" });
}

function addFoodFeatureList(els: ElementDesc[], input: LayoutInput, x: number, y: number, width: number, accent: string, maxItems = 4) {
  const items = shortBodyItems(input.body, maxItems);
  if (items.length <= 1) {
    if (input.body) {
      els.push({ kind: "text", x, y, w: width, text: fitTextToLines(input.body, width, 29, 5), size: 29, color: "rgba(255,255,255,0.92)", align: "left", weight: 480, font: input.fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
    }
    return;
  }

  items.forEach((item, index) => {
    const itemY = y + index * 102;
    els.push({ kind: "circle", cx: x + 12, cy: itemY + 18, r: 7, fill: accent, selectable: false, name: "Marcador", role: "accent" });
    els.push({ kind: "text", x: x + 34, y: itemY, w: width - 34, text: item, size: 26, color: "#ffffff", align: "left", weight: 650, font: input.fonts.body, lineHeight: 1.08, name: "Item", role: "body" });
    if (index < items.length - 1) {
      els.push({ kind: "rect", x: x + 34, y: itemY + 72, w: width - 34, h: 2, fill: accent, opacity: 0.44, selectable: false, name: "Separador", role: "accent" });
    }
  });
}

function addFoodMenuContent(els: ElementDesc[], input: LayoutInput, accent: string) {
  const { body, width: W, height: H, fonts } = input;
  let lines = parseRichBody(body || "");
  if (!lines.length && body) lines = [{ kind: "meta", text: body }];

  const contentTop = 290;
  const contentBottom = H - (input.cta ? 156 : 74);
  const contentWidth = W * 0.53;
  let y = contentTop;

  for (const line of lines.slice(0, 11)) {
    if (line.kind === "separator") {
      y += 10;
      continue;
    }
    if (y > contentBottom - 38) break;
    const heading = line.kind === "heading" || line.kind === "subheading";
    const size = heading ? 27 : line.kind === "meta" ? 24 : 23;
    const estimated = estimatedLineCount(line.text, contentWidth, size);
    els.push({ kind: "text", x: 64, y, w: contentWidth, text: line.text, size, color: heading ? accent : "#ffffff", align: "left", weight: heading ? 820 : line.kind === "item" ? 680 : 480, font: heading ? fonts.display : fonts.body, lineHeight: 1.08, name: heading ? "Seção" : "Item", role: heading ? "section" : "body" });
    y += estimated * size * 1.02 + (heading ? 24 : 17);
    if (!heading && y < contentBottom - 24) {
      els.push({ kind: "rect", x: 64, y: y - 8, w: contentWidth * 0.88, h: 2, fill: accent, opacity: 0.36, selectable: false, name: "Separador", role: "accent" });
    }
  }
}

function buildFoodLayout(id: LayoutId, input: LayoutInput): ElementDesc[] {
  const { title, body, imageUrl, width: W, height: H, fonts } = input;
  const accent = foodAccentColor(input);
  const els: ElementDesc[] = [];
  const variant = foodVariantForLayout(id, input);
  const pageX = 64;

  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: "#080808", selectable: false, name: "Fundo", role: "background" });
  if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem gastronômica", role: "hero" });
  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: "#000000", opacity: 0.16, selectable: false, name: "Tratamento", role: "scrim" });

  if (variant === "menu") {
    els.push({ kind: "rect", x: 0, y: 0, w: W * 0.69, h: H, fill: "#050505", opacity: 0.93, selectable: false, name: "Painel do cardápio", role: "panel" });
    els.push({ kind: "rect", x: W * 0.62, y: 0, w: W * 0.2, h: H, fill: "#000000", opacity: 0.3, selectable: false, name: "Transição", role: "scrim" });
    addFoodHeader(els, input, accent);
    const titleSize = fittedTitleSize(title, W * 0.57, 68, 43, 2);
    els.push({ kind: "text", x: pageX, y: 130, w: W * 0.57, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 850, font: fonts.display, lineHeight: 0.94, charSpacing: -4, name: "Título", role: "title" });
    els.push({ kind: "rect", x: pageX, y: 246, w: W * 0.12, h: 7, fill: accent, rx: 3, selectable: false, name: "Acento", role: "accent" });
    addFoodMenuContent(els, input, accent);
    addFoodCta(els, input, pageX, H - 126, W * 0.5, accent);
    addFoodFrame(els, W, H, accent);
    return els;
  }

  if (variant === "cover") {
    els.push({ kind: "rect", x: 0, y: 0, w: W * 0.55, h: H, fill: "#050505", opacity: 0.75, selectable: false, name: "Painel editorial", role: "panel" });
    els.push({ kind: "rect", x: W * 0.49, y: 0, w: W * 0.2, h: H, fill: "#000000", opacity: 0.26, selectable: false, name: "Transição", role: "scrim" });
    addFoodHeader(els, input, accent);
    const titleWidth = W * 0.43;
    const titleSize = fittedTitleSize(title, titleWidth, 88, 54, 3);
    const titleLines = Math.min(3, estimatedLineCount(title, titleWidth, titleSize));
    els.push({ kind: "rect", x: pageX, y: H * 0.25, w: 82, h: 7, fill: accent, rx: 3, selectable: false, name: "Acento", role: "accent" });
    els.push({ kind: "text", x: pageX, y: H * 0.29, w: titleWidth, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 860, font: fonts.display, lineHeight: 0.9, charSpacing: -5, shadow: "soft", name: "Título", role: "title" });
    if (body) els.push({ kind: "text", x: pageX, y: H * 0.29 + titleLines * titleSize * 0.94 + 34, w: W * 0.4, text: fitTextToLines(body, W * 0.4, 28, 4), size: 28, color: "rgba(255,255,255,0.92)", align: "left", weight: 480, font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
    addFoodCta(els, input, pageX, H * 0.79, W * 0.38, accent);
    addFoodFrame(els, W, H, accent);
    return els;
  }

  if (variant === "feature") {
    els.push({ kind: "rect", x: 0, y: 0, w: W * 0.5, h: H, fill: "#050505", opacity: 0.86, selectable: false, name: "Painel de conteúdo", role: "panel" });
    els.push({ kind: "rect", x: W * 0.5, y: H * 0.12, w: 5, h: H * 0.76, fill: accent, opacity: 0.88, selectable: false, name: "Divisor", role: "accent" });
    addFoodHeader(els, input, accent);
    const titleSize = fittedTitleSize(title, W * 0.38, 66, 43, 3);
    const titleLines = Math.min(3, estimatedLineCount(title, W * 0.38, titleSize));
    els.push({ kind: "text", x: pageX, y: H * 0.16, w: W * 0.38, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 840, font: fonts.display, lineHeight: 0.92, charSpacing: -4, name: "Título", role: "title" });
    addFoodFeatureList(els, input, pageX, H * 0.16 + titleLines * titleSize + 42, W * 0.37, accent, 4);
    addFoodCta(els, input, pageX, H * 0.82, W * 0.36, accent);
    addFoodFrame(els, W, H, accent);
    return els;
  }

  if (variant === "detail") {
    els.push({ kind: "rect", x: 0, y: H * 0.57, w: W, h: H * 0.43, fill: "#050505", opacity: 0.9, selectable: false, name: "Painel inferior", role: "panel" });
    els.push({ kind: "rect", x: 0, y: H * 0.5, w: W, h: H * 0.16, fill: "#000000", opacity: 0.28, selectable: false, name: "Transição", role: "scrim" });
    addFoodHeader(els, input, accent);
    const titleSize = fittedTitleSize(title, W * 0.76, 70, 47, 2);
    els.push({ kind: "text", x: pageX, y: H * 0.63, w: W * 0.76, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 850, font: fonts.display, lineHeight: 0.92, charSpacing: -5, name: "Título", role: "title" });
    if (body) els.push({ kind: "text", x: pageX, y: H * 0.77, w: W * 0.6, text: fitTextToLines(body, W * 0.6, 29, 3), size: 29, color: "rgba(255,255,255,0.9)", align: "left", weight: 480, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
    addFoodCta(els, input, W * 0.7, H * 0.82, W * 0.22, accent, true);
    addFoodFrame(els, W, H, accent);
    return els;
  }

  if (variant === "editorial") {
    els.push({ kind: "rect", x: 0, y: 0, w: W * 0.46, h: H, fill: "#050505", opacity: 0.72, selectable: false, name: "Painel lateral", role: "panel" });
    els.push({ kind: "rect", x: pageX, y: H * 0.22, w: W * 0.36, h: H * 0.51, fill: "#080808", opacity: 0.78, rx: 22, selectable: false, name: "Card editorial", role: "panel" });
    els.push({ kind: "rect", x: pageX, y: H * 0.22, w: W * 0.36, h: 5, fill: accent, selectable: false, name: "Acento", role: "accent" });
    addFoodHeader(els, input, accent);
    const titleSize = fittedTitleSize(title, W * 0.3, 67, 43, 3);
    const titleLines = Math.min(3, estimatedLineCount(title, W * 0.3, titleSize));
    els.push({ kind: "text", x: pageX + 32, y: H * 0.29, w: W * 0.3, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 850, font: fonts.display, lineHeight: 0.92, charSpacing: -4, name: "Título", role: "title" });
    if (body) els.push({ kind: "text", x: pageX + 32, y: H * 0.29 + titleLines * titleSize + 28, w: W * 0.29, text: fitTextToLines(body, W * 0.29, 27, 5), size: 27, color: "rgba(255,255,255,0.9)", align: "left", weight: 470, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
    addFoodCta(els, input, pageX + 32, H * 0.61, W * 0.26, accent);
    addFoodFrame(els, W, H, accent);
    return els;
  }

  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: "#000000", opacity: variant === "cta" ? 0.5 : 0.34, selectable: false, name: "Sombra", role: "scrim" });
  els.push({ kind: "rect", x: W * 0.13, y: H * 0.24, w: W * 0.74, h: H * 0.5, fill: "#050505", opacity: 0.86, rx: 26, selectable: false, name: "Placa editorial", role: "panel" });
  els.push({ kind: "rect", x: W * 0.25, y: H * 0.24, w: W * 0.5, h: 5, fill: accent, selectable: false, name: "Acento", role: "accent" });
  addFoodHeader(els, input, accent);
  const titleSize = fittedTitleSize(title, W * 0.62, 76, 48, 2);
  const titleLines = Math.min(3, estimatedLineCount(title, W * 0.62, titleSize));
  els.push({ kind: "text", x: W * 0.19, y: H * 0.33, w: W * 0.62, text: title, size: titleSize, color: "#ffffff", align: "center", weight: 860, font: fonts.display, lineHeight: 0.92, charSpacing: -5, name: "Título", role: "title" });
  if (body) els.push({ kind: "text", x: W * 0.23, y: H * 0.33 + titleLines * titleSize + 26, w: W * 0.54, text: fitTextToLines(body, W * 0.54, 28, 3), size: 28, color: "rgba(255,255,255,0.9)", align: "center", weight: 480, font: fonts.body, lineHeight: 1.16, name: "Texto", role: "body" });
  addFoodCta(els, input, W * 0.3, H * 0.64, W * 0.4, accent, true);
  addFoodFrame(els, W, H, accent);
  return els;
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
  const requestedSocial = String(id).startsWith("social-");
  const bodySize = px(clamp(denseMode ? W * 0.024 : W * 0.032, denseMode ? 20 : 27, denseMode ? 31 : 38));
  const baseEffectiveId: LayoutId = denseMode && !requestedSocial ? "menu-board" : id;
  const techMode = !denseMode && isTechCampaign(input);
  const imageLayoutMap: Partial<Record<LayoutId, LayoutId>> = {
    "social-hero": "text-over-image",
    "social-editorial": "side-text",
    "social-workflow": "side-text",
    "social-feature-grid": "diagonal",
    "social-cards": "bottom-text",
    "social-minimal": "hero-image",
    "social-cta": "center-text",
  };
  const effectiveId: LayoutId = imageUrl
    ? denseMode
      ? "menu-board"
      : imageLayoutMap[id] || id
    : baseEffectiveId;

  // Gastronomia recebe direção de arte própria e mantém o mesmo layout que
  // orientou a geração da imagem. Assim, a área livre nunca troca de lado
  // entre o prompt visual e a montagem final.
  if (imageUrl && isFoodCampaign(input)) {
    return buildFoodLayout(denseMode ? "menu-board" : id, input);
  }

  if (!imageUrl && String(effectiveId).startsWith("social-")) {
    return buildSocialLayout(effectiveId, input);
  }

  if (!imageUrl && techMode) {
    return buildTechLayout(effectiveId, input);
  }

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
  if (role.includes("capa")) return "social-hero";
  if (role.includes("cta")) return "social-cta";
  const sequence: LayoutId[] = [
    "social-workflow",
    "social-cards",
    "social-feature-grid",
    "social-editorial",
    "social-minimal",
    "social-hero",
  ];
  return sequence[Math.max(0, index - 1) % sequence.length];
}

export function compositionForLayout(layout: LayoutId): string {
  switch (layout) {
    case "social-hero":
      return "Place one bold hero subject in the right 48–58% of the frame. Keep the left 42% naturally darker, calm and low-detail for a large headline. Do not generate text.";
    case "social-editorial":
      return "Create an asymmetric editorial scene with the hero subject on the right half and a naturally calm, darker left area for an editorial card. Do not generate text.";
    case "social-workflow":
      return "Keep the hero subject and supporting details in the right half. Preserve the left 46% as a darker, low-detail area for a structured feature list. Do not generate text or UI labels.";
    case "social-feature-grid":
      return "Place the dominant hero on the right 52% with controlled secondary details. Keep the left side calm and dark enough for four concise feature lines. Do not generate text.";
    case "social-cards":
      return "Keep the hero subject in the upper 58% with rich foreground and background separation. Let the lower 38% fall naturally darker for a strong headline and short copy. Do not generate text.";
    case "social-minimal":
      return "Create a refined key visual with the focal subject visible around the outer edges and a calm central area suitable for one short high-impact message. Do not generate text.";
    case "social-cta":
      return "Create a confident closing visual with the hero subject in the upper/right area and a calmer central-to-lower zone for a short call to action. Do not generate text.";
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
