// 10+ layouts with random variations. Each returns a list of fabric-ready
// element descriptors that Editor consumes to build a canvas.

export type ElementDesc =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; opacity?: number; rx?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; opacity?: number }
  | { kind: "image"; x: number; y: number; w: number; h: number; url: string; opacity?: number }
  | { kind: "text"; x: number; y: number; w: number; text: string; size: number; color: string; align: "left"|"center"|"right"; weight?: number; italic?: boolean; shadow?: string; font?: string };

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
const between = (a: number, b: number) => a + Math.random() * (b - a);

export const LAYOUT_IDS = [
  "top-text", "center-text", "bottom-text", "side-text",
  "text-over-image", "hero-image", "big-text-small-image",
  "split", "geometric-bg", "framed", "diagonal", "quote-card",
] as const;

export type LayoutId = typeof LAYOUT_IDS[number];

export function pickLayout(): LayoutId {
  return rnd([...LAYOUT_IDS]);
}

export function buildLayout(id: LayoutId, input: LayoutInput): ElementDesc[] {
  const { title, body, imageUrl, palette, width: W, height: H, fonts } = input;
  const [bg, primary, accent, text] = palette;
  const els: ElementDesc[] = [];

  // background
  els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: bg });

  const P = Math.round(W * 0.06); // padding

  const bigTitle = Math.round(W * between(0.09, 0.13));
  const medTitle = Math.round(W * between(0.06, 0.085));
  const bodySize = Math.round(W * between(0.03, 0.042));

  const titleAlign = rnd(["left","center","right"] as const);

  switch (id) {
    case "top-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: H*0.45, w: W, h: H*0.55, url: imageUrl });
      els.push({ kind: "text", x: P, y: P, w: W-2*P, text: title, size: medTitle, color: text, align: titleAlign, weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: P, y: P + medTitle + 20, w: W-2*P, text: body, size: bodySize, color: text, align: titleAlign, font: fonts.body });
      break;
    }
    case "center-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, opacity: 0.35 });
      els.push({ kind: "text", x: P, y: H/2 - medTitle, w: W-2*P, text: title, size: bigTitle, color: text, align: "center", weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: P, y: H/2 + medTitle*0.6, w: W-2*P, text: body, size: bodySize, color: text, align: "center", font: fonts.body });
      break;
    }
    case "bottom-text": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H*0.6, url: imageUrl });
      els.push({ kind: "rect", x: 0, y: H*0.55, w: W, h: H*0.45, fill: bg, opacity: 0.95 });
      els.push({ kind: "text", x: P, y: H*0.62, w: W-2*P, text: title, size: medTitle, color: text, align: titleAlign, weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: P, y: H*0.62 + medTitle + 20, w: W-2*P, text: body, size: bodySize, color: text, align: titleAlign, font: fonts.body });
      break;
    }
    case "side-text": {
      const leftText = true;
      const halfW = W*0.5;
      if (imageUrl) els.push({ kind: "image", x: leftText ? halfW : 0, y: 0, w: halfW, h: H, url: imageUrl });
      els.push({ kind: "text", x: (leftText?0:halfW)+P, y: H*0.3, w: halfW-2*P, text: title, size: medTitle, color: text, align: "left", weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: (leftText?0:halfW)+P, y: H*0.3+medTitle+20, w: halfW-2*P, text: body, size: bodySize, color: text, align: "left", font: fonts.body });
      break;
    }
    case "text-over-image": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl });
      els.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: "#000000", opacity: 0.45 });
      const titleY = H * between(0.18, 0.42);
      els.push({ kind: "text", x: P, y: titleY, w: W-2*P, text: title, size: bigTitle, color: "#ffffff", align: titleAlign, weight: 700, shadow: "rgba(0,0,0,0.6) 0 4 20", font: fonts.display });
      if (body) els.push({ kind: "text", x: P, y: Math.min(H*0.78, titleY + bigTitle*1.5), w: W-2*P, text: body, size: bodySize, color: "#ffffff", align: titleAlign, font: fonts.body });
      break;
    }
    case "hero-image": {
      if (imageUrl) els.push({ kind: "image", x: W*0.1, y: H*0.08, w: W*0.8, h: H*0.6, url: imageUrl });
      els.push({ kind: "text", x: P, y: H*0.72, w: W-2*P, text: title, size: medTitle, color: text, align: "center", weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: P, y: H*0.72+medTitle+16, w: W-2*P, text: body, size: bodySize, color: text, align: "center", font: fonts.body });
      break;
    }
    case "big-text-small-image": {
      els.push({ kind: "text", x: P, y: P, w: W-2*P, text: title, size: bigTitle*1.1, color: text, align: "left", weight: 700, font: fonts.display });
      if (imageUrl) els.push({ kind: "image", x: W*0.55, y: H*0.6, w: W*0.4, h: W*0.4, url: imageUrl });
      if (body) els.push({ kind: "text", x: P, y: H*0.65, w: W*0.5, text: body, size: bodySize, color: text, align: "left", font: fonts.body });
      break;
    }
    case "split": {
      els.push({ kind: "rect", x: 0, y: 0, w: W/2, h: H, fill: primary });
      els.push({ kind: "rect", x: W/2, y: 0, w: W/2, h: H, fill: bg });
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W/2, h: H, url: imageUrl, opacity: 0.9 });
      els.push({ kind: "text", x: W/2+P, y: H/2 - medTitle, w: W/2-2*P, text: title, size: medTitle, color: text, align: "left", weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: W/2+P, y: H/2+medTitle*0.5, w: W/2-2*P, text: body, size: bodySize, color: text, align: "left", font: fonts.body });
      break;
    }
    case "geometric-bg": {
      els.push({ kind: "circle", cx: W*between(0.1, 0.9), cy: H*between(0.1, 0.5), r: W*between(0.2, 0.35), fill: primary, opacity: 0.7 });
      els.push({ kind: "rect", x: W*between(0, 0.4), y: H*between(0.4, 0.7), w: W*0.6, h: W*0.6, fill: accent, opacity: 0.5, rx: 24 });
      if (imageUrl) els.push({ kind: "image", x: W*0.25, y: H*0.15, w: W*0.5, h: W*0.5, url: imageUrl });
      els.push({ kind: "text", x: P, y: H*0.7, w: W-2*P, text: title, size: medTitle, color: text, align: "center", weight: 700, font: fonts.display });
      break;
    }
    case "framed": {
      const b = W*0.04;
      els.push({ kind: "rect", x: b, y: b, w: W-2*b, h: H-2*b, fill: primary, opacity: 0.15, rx: 12 });
      if (imageUrl) els.push({ kind: "image", x: W*0.15, y: H*0.15, w: W*0.7, h: H*0.4, url: imageUrl });
      els.push({ kind: "text", x: P, y: H*0.6, w: W-2*P, text: title, size: medTitle, color: text, align: "center", weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: P, y: H*0.6+medTitle+16, w: W-2*P, text: body, size: bodySize, color: text, align: "center", font: fonts.body });
      break;
    }
    case "diagonal": {
      if (imageUrl) els.push({ kind: "image", x: 0, y: 0, w: W, h: H, url: imageUrl, opacity: 0.55 });
      els.push({ kind: "circle", cx: W*1.1, cy: H*1.1, r: W*0.9, fill: accent, opacity: 0.35 });
      els.push({ kind: "text", x: P, y: H*0.35, w: W-2*P, text: title, size: bigTitle, color: text, align: "left", weight: 700, font: fonts.display });
      if (body) els.push({ kind: "text", x: P, y: H*0.35 + bigTitle + 20, w: W-2*P, text: body, size: bodySize, color: text, align: "left", font: fonts.body });
      break;
    }
    case "quote-card": {
      els.push({ kind: "rect", x: W*0.08, y: H*0.15, w: W*0.84, h: H*0.7, fill: primary, opacity: 0.9, rx: 24 });
      els.push({ kind: "text", x: W*0.12, y: H*0.25, w: W*0.76, text: "“", size: bigTitle*1.5, color: text, align: "left", weight: 700, font: fonts.display });
      els.push({ kind: "text", x: W*0.12, y: H*0.35, w: W*0.76, text: title, size: medTitle, color: text, align: "left", weight: 600, italic: true, font: fonts.display });
      if (body) els.push({ kind: "text", x: W*0.12, y: H*0.7, w: W*0.76, text: body, size: bodySize, color: text, align: "right", font: fonts.body });
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
  ["#111", "#e5e7eb", "#a3a3a3", "#111"],
  ["#f5f5f0", "#111", "#ef4444", "#111"],
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
  if (/impact|bold|street|festival|esport|sport|vibrante/.test(value)) {
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
  const sequence: LayoutId[] = ["side-text", "hero-image", "bottom-text", "split", "top-text", "diagonal", "framed"];
  return sequence[Math.max(0, index) % sequence.length];
}

export function compositionForLayout(layout: LayoutId): string {
  switch (layout) {
    case "top-text":
      return "Keep the strongest visual interest in the lower half and preserve a calmer upper area for editorial copy.";
    case "bottom-text":
      return "Keep the hero subject in the upper half and preserve a calmer lower area for editorial copy.";
    case "side-text":
      return "Place the hero subject primarily on the right side and preserve clean negative space on the left for copy.";
    case "split":
      return "Compose the hero subject to work inside the left half of the frame, leaving the right half cleaner for copy.";
    case "hero-image":
      return "Create a strong centered hero composition with clean edges and enough breathing room around the subject.";
    case "center-text":
      return "Use a simple cinematic background with visual interest around the edges and a calm center for the final CTA.";
    case "text-over-image":
      return "Use a full-bleed cinematic hero, preferably biased slightly to the right, with readable tonal separation for copy overlay.";
    case "framed":
      return "Keep the key subject centered with balanced margins so it works inside an editorial framed composition.";
    case "diagonal":
      return "Use dynamic depth and diagonal movement while keeping the left-center area relatively clean for copy.";
    case "big-text-small-image":
      return "Use a compact secondary hero subject in the lower-right quadrant and keep the upper-left area clean.";
    case "geometric-bg":
      return "Use a clean centered subject with simple background separation that can combine with geometric graphic layers.";
    case "quote-card":
      return "Use subtle atmospheric imagery with low visual noise so a large quote card can remain dominant.";
  }
}
