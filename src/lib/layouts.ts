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
  palette: string[]; // [bg, primary, accent, text]
  width: number;
  height: number;
  fonts: { display: string; body: string };
}

const rnd = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const px = (value: number) => Math.round(value);

export const LAYOUT_IDS = [
  "top-text", "center-text", "bottom-text", "side-text",
  "text-over-image", "hero-image", "big-text-small-image",
  "split", "geometric-bg", "framed", "diagonal", "quote-card",
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

function addBrandAccent(els: ElementDesc[], x: number, y: number, width: number, accent: string) {
  els.push({ kind: "rect", x, y, w: width, h: 8, fill: accent, rx: 4, selectable: false });
}

function addLeftScrim(els: ElementDesc[], W: number, H: number) {
  // Três faixas discretas simulam uma transição tonal sem aplicar filtro global na foto.
  els.push({ kind: "rect", x: 0, y: 0, w: W * 0.68, h: H, fill: "#000000", opacity: 0.22, selectable: false });
  els.push({ kind: "rect", x: 0, y: 0, w: W * 0.55, h: H, fill: "#000000", opacity: 0.20, selectable: false });
  els.push({ kind: "rect", x: 0, y: 0, w: W * 0.43, h: H, fill: "#000000", opacity: 0.18, selectable: false });
}

function addBottomScrim(els: ElementDesc[], W: number, H: number) {
  els.push({ kind: "rect", x: 0, y: H * 0.55, w: W, h: H * 0.45, fill: "#000000", opacity: 0.34, selectable: false });
  els.push({ kind: "rect", x: 0, y: H * 0.67, w: W, h: H * 0.33, fill: "#000000", opacity: 0.26, selectable: false });
}

export function buildLayout(id: LayoutId, input: LayoutInput): ElementDesc[] {
  const { title, body, imageUrl, palette, width: W, height: H, fonts } = input;
  const [bg, primary, accent, text] = palette;
  const els: ElementDesc[] = [];
  const P = px(W * 0.065);
  const bodySize = px(clamp(W * 0.032, 27, 38));

  // O fundo base não deve ser movido por acidente no editor.
  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: bg, selectable: false, name: "Fundo", role: "background" });

  switch (id) {
    case "text-over-image": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl });
      addLeftScrim(els, W, H);
      const boxW = W * 0.47;
      const titleSize = fittedTitleSize(title, boxW, W * 0.086, W * 0.052, 2);
      const titleLines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const titleY = H * 0.25;
      addBrandAccent(els, P, titleY - 28, W * 0.085, accent);
      els.push({
        kind: "text", x: P, y: titleY, w: boxW, text: title, size: titleSize,
        color: "#ffffff", align: "left", weight: 760, font: fonts.display,
        lineHeight: 0.94, charSpacing: -8, shadow: "soft",
      });
      if (body) {
        const bodyY = titleY + titleLines * titleSize * 0.96 + px(W * 0.032);
        els.push({
          kind: "text", x: P, y: bodyY, w: boxW * 0.95, text: body, size: bodySize,
          color: "#ffffff", align: "left", weight: 450, font: fonts.body, lineHeight: 1.18,
        });
      }
      break;
    }

    case "side-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
      // Em vez de cobrir quase metade da arte com uma cor chapada, criamos
      // uma área de leitura translúcida sobre a própria fotografia.
      els.push({ kind: "rect", x: 0, y: 0, w: W * 0.46, h: H, fill: "#000000", opacity: 0.5, selectable: false, name: "Sombra de leitura", role: "scrim" });
      els.push({ kind: "rect", x: W * 0.455, y: H * 0.13, w: 6, h: H * 0.74, fill: accent, opacity: 0.9, selectable: false, name: "Acento", role: "accent" });
      const boxW = W * 0.35;
      const titleSize = fittedTitleSize(title, boxW, W * 0.068, W * 0.041, 3);
      const lines = Math.min(4, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.24;
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -6, name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize + 30, w: boxW, text: body, size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
      break;
    }

    case "bottom-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl });
      addBottomScrim(els, W, H);
      const boxW = W - 2 * P;
      const titleSize = fittedTitleSize(title, boxW, W * 0.078, W * 0.05, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.67;
      addBrandAccent(els, P, y - 24, W * 0.09, accent);
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 760, font: fonts.display, lineHeight: 0.95, charSpacing: -6, shadow: "soft" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize * 0.97 + 24, w: W * 0.72, text: body, size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.18 });
      break;
    }

    case "top-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: H * 0.38, w: W, h: H * 0.62, url: imageUrl });
      const boxW = W - 2 * P;
      const titleSize = fittedTitleSize(title, boxW, W * 0.075, W * 0.048, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      addBrandAccent(els, P, P, W * 0.08, accent);
      els.push({ kind: "text", x: P, y: P + 28, w: boxW, text: title, size: titleSize, color: text, align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -6 });
      if (body) els.push({ kind: "text", x: P, y: P + 28 + lines * titleSize + 20, w: W * 0.72, text: body, size: bodySize, color: text, align: "left", font: fonts.body, lineHeight: 1.16 });
      break;
    }

    case "center-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, opacity: 0.78 });
      els.push({ kind: "rect", x: W * 0.12, y: H * 0.23, w: W * 0.76, h: H * 0.52, fill: "#050505", opacity: 0.62, rx: 32, selectable: false });
      const boxW = W * 0.64;
      const titleSize = fittedTitleSize(title, boxW, W * 0.082, W * 0.05, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.34;
      els.push({ kind: "text", x: W * 0.18, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "center", weight: 760, font: fonts.display, lineHeight: 0.96, charSpacing: -5 });
      if (body) els.push({ kind: "text", x: W * 0.22, y: y + lines * titleSize + 28, w: W * 0.56, text: body, size: bodySize, color: "#ffffff", align: "center", font: fonts.body, lineHeight: 1.18 });
      break;
    }

    case "hero-image": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl });
      addBottomScrim(els, W, H);
      const boxW = W * 0.7;
      const titleSize = fittedTitleSize(title, boxW, W * 0.072, W * 0.047, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.71;
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -5, shadow: "soft" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize + 18, w: W * 0.62, text: body, size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.16 });
      break;
    }

    case "split": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, name: "Imagem principal", role: "hero" });
      const panelX = W * 0.55;
      els.push({ kind: "rect", x: panelX, y: 0, w: W - panelX, h: H, fill: "#050505", opacity: 0.52, selectable: false, name: "Painel translúcido", role: "scrim" });
      els.push({ kind: "rect", x: panelX, y: H * 0.12, w: 7, h: H * 0.76, fill: accent, rx: 4, selectable: false, name: "Acento", role: "accent" });
      const x = panelX + P * 0.72;
      const boxW = W - x - P * 0.72;
      const titleSize = fittedTitleSize(title, boxW, W * 0.064, W * 0.039, 3);
      const lines = Math.min(4, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.28;
      els.push({ kind: "text", x, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -5, name: "Título", role: "title" });
      if (body) els.push({ kind: "text", x, y: y + lines * titleSize + 24, w: boxW, text: body, size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.18, name: "Texto", role: "body" });
      break;
    }

    case "framed": {
      if (imageUrl) els.push({ kind: "image", x: P, y: P, w: W - 2 * P, h: H * 0.58, url: imageUrl });
      els.push({ kind: "rect", x: P, y: P, w: W - 2 * P, h: H * 0.58, fill: "#000000", opacity: 0.06, selectable: false });
      const boxW = W - 2 * P;
      const titleSize = fittedTitleSize(title, boxW, W * 0.068, W * 0.046, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.69;
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: text, align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -5 });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize + 20, w: W * 0.7, text: body, size: bodySize, color: text, align: "left", font: fonts.body, lineHeight: 1.16 });
      break;
    }

    case "big-text-small-image": {
      const boxW = W * 0.7;
      const titleSize = fittedTitleSize(title, boxW, W * 0.09, W * 0.052, 3);
      const lines = Math.min(4, estimatedLineCount(title, boxW, titleSize));
      addBrandAccent(els, P, P, W * 0.1, accent);
      els.push({ kind: "text", x: P, y: P + 30, w: boxW, text: title, size: titleSize, color: text, align: "left", weight: 780, font: fonts.display, lineHeight: 0.92, charSpacing: -8 });
      if (imageUrl) els.push({ kind: "image", x: W * 0.56, y: H * 0.52, w: W * 0.38, h: H * 0.4, url: imageUrl });
      if (body) els.push({ kind: "text", x: P, y: P + 30 + lines * titleSize + 28, w: W * 0.46, text: body, size: bodySize, color: text, align: "left", font: fonts.body, lineHeight: 1.16 });
      break;
    }

    case "diagonal": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl });
      addLeftScrim(els, W, H);
      els.push({ kind: "circle", cx: W * 0.92, cy: H * 0.08, r: W * 0.22, fill: primary, opacity: 0.18, selectable: false });
      const boxW = W * 0.49;
      const titleSize = fittedTitleSize(title, boxW, W * 0.078, W * 0.048, 2);
      const lines = Math.min(3, estimatedLineCount(title, boxW, titleSize));
      const y = H * 0.3;
      els.push({ kind: "text", x: P, y, w: boxW, text: title, size: titleSize, color: "#ffffff", align: "left", weight: 760, font: fonts.display, lineHeight: 0.95, charSpacing: -6, shadow: "soft" });
      if (body) els.push({ kind: "text", x: P, y: y + lines * titleSize + 25, w: boxW, text: body, size: bodySize, color: "#ffffff", align: "left", font: fonts.body, lineHeight: 1.18 });
      break;
    }

    case "geometric-bg": {
      els.push({ kind: "circle", cx: W * 0.86, cy: H * 0.16, r: W * 0.26, fill: primary, opacity: 0.24, selectable: false });
      els.push({ kind: "circle", cx: W * 0.16, cy: H * 0.84, r: W * 0.18, fill: accent, opacity: 0.2, selectable: false });
      if (imageUrl) els.push({ kind: "image", x: W * 0.42, y: H * 0.2, w: W * 0.5, h: H * 0.58, url: imageUrl });
      const boxW = W * 0.42;
      const titleSize = fittedTitleSize(title, boxW, W * 0.068, W * 0.044, 3);
      const lines = Math.min(4, estimatedLineCount(title, boxW, titleSize));
      els.push({ kind: "text", x: P, y: H * 0.28, w: boxW, text: title, size: titleSize, color: text, align: "left", weight: 750, font: fonts.display, lineHeight: 0.96, charSpacing: -5 });
      if (body) els.push({ kind: "text", x: P, y: H * 0.28 + lines * titleSize + 24, w: boxW, text: body, size: bodySize, color: text, align: "left", font: fonts.body, lineHeight: 1.16 });
      break;
    }

    case "quote-card": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, opacity: 0.38 });
      els.push({ kind: "rect", x: W * 0.08, y: H * 0.14, w: W * 0.84, h: H * 0.72, fill: bg, opacity: 0.92, rx: 32, selectable: false });
      const boxW = W * 0.68;
      const titleSize = fittedTitleSize(title, boxW, W * 0.067, W * 0.043, 4);
      const lines = Math.min(5, estimatedLineCount(title, boxW, titleSize));
      els.push({ kind: "text", x: W * 0.16, y: H * 0.24, w: boxW, text: title, size: titleSize, color: text, align: "left", weight: 650, italic: true, font: fonts.display, lineHeight: 1.0 });
      if (body) els.push({ kind: "text", x: W * 0.16, y: H * 0.24 + lines * titleSize + 28, w: boxW, text: body, size: bodySize, color: text, align: "left", font: fonts.body, lineHeight: 1.16 });
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

export function layoutForSlide(index: number, kind: string): LayoutId {
  const role = kind.toLowerCase();
  if (role.includes("capa")) return "text-over-image";
  if (role.includes("cta")) return "center-text";
  const sequence: LayoutId[] = ["side-text", "hero-image", "bottom-text", "diagonal", "text-over-image", "framed", "top-text"];
  return sequence[Math.max(0, index - 1) % sequence.length];
}

export function compositionForLayout(layout: LayoutId): string {
  switch (layout) {
    case "top-text":
      return "Keep the hero subject and strongest detail in the lower 60% of the frame. The upper 32% must stay calm, naturally textured and low-detail for copy.";
    case "bottom-text":
      return "Keep the hero subject in the upper 55% with clear separation. Preserve the lower 35% as a darker, calmer copy-safe area without artificial blank panels.";
    case "side-text":
      return "Place the hero subject in the right 55% of the frame. Keep the left 38% visually quiet and darker so typography can sit there without covering the subject.";
    case "split":
      return "Design the hero scene to crop strongly inside the left 56% of the frame. Keep important details away from the right 40%, which will become an editorial copy panel.";
    case "hero-image":
      return "Create a strong hero subject in the upper-center/right area with premium negative space and a darker lower-left zone for supporting copy.";
    case "center-text":
      return "Keep the central 60% calm and low-detail for the CTA, while placing atmospheric visual interest and secondary objects around the edges.";
    case "text-over-image":
      return "Place the hero subject clearly in the right half, preferably right-center. Keep the left 42% darker, low-detail and naturally empty for a two-line headline and short subtitle.";
    case "framed":
      return "Center the key subject with generous clean margins and no critical details near the frame edges, suitable for an editorial framed crop.";
    case "diagonal":
      return "Create dynamic depth moving from bottom-right toward top-right. Keep the left-center 45% calm and dark enough for readable copy.";
    case "big-text-small-image":
      return "Keep a compact secondary hero subject in the lower-right quadrant and leave the upper-left 65% clean for oversized editorial typography.";
    case "geometric-bg":
      return "Place the hero subject on the right side with clean silhouette separation and a restrained background that can combine with geometric graphic layers.";
    case "quote-card":
      return "Use subtle atmospheric imagery with very low visual noise and no central focal object so a large quote card remains dominant.";
  }
}
