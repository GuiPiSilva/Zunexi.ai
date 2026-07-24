// Compõe o post final no navegador: pega a foto pura gerada pela IA
// (sem nenhum texto) e desenha o título/texto por cima usando Canvas 2D.
// Isso garante 100% de fidelidade da ortografia em português e elimina
// qualquer chance de a IA gerar molduras, cards ou badges de "slide X/Y".
//
// IMPORTANTE: existem vários TEMPLATES de posicionamento de texto (canto,
// centro, faixa lateral, selo, etc.). Um é sorteado a cada chamada (ou pode
// ser fixado via opts.layout), para o post final nunca sair sempre com o
// texto no mesmo lugar — mesmo problema de "engessamento" que já resolvemos
// para o conteúdo e a imagem, mas aqui na etapa de composição visual.



export type ComposeLayout =
  | "bottom-left"
  | "bottom-center"
  | "top-left"
  | "center-panel"
  | "side-bar"
  | "corner-badge";

const LAYOUTS: ComposeLayout[] = [
  "bottom-left",
  "bottom-center",
  "top-left",
  "center-panel",
  "side-bar",
  "corner-badge",
];

const ACCENT_COLORS = ["#facc15", "#22d3ee", "#a855f7", "#f97316", "#34d399", "#f43f5e"];

export interface ComposePostOptions {
  background: string; // dataURL ou URL da foto pura (sem texto)
  title: string;
  body?: string;
  brand?: string;
  width?: number;
  height?: number;
  accentColor?: string;
  layout?: ComposeLayout; // opcional — se não vier, sorteia
}

export async function composePost(opts: ComposePostOptions): Promise<string> {
  const {
    background,
    title,
    body,
    brand,
    width = 1080,
    height = 1350,
    accentColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
    layout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)],
  } = opts;

  await ensureFontsLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não suportado neste navegador.");

  const img = await loadImage(background);

  switch (layout) {
    case "bottom-center":
      drawImageCover(ctx, img, 0, 0, width, height);
      drawBottomCenter(ctx, { title, body, brand, width, height, accentColor });
      break;
    case "top-left":
      drawImageCover(ctx, img, 0, 0, width, height);
      drawTopLeft(ctx, { title, body, brand, width, height, accentColor });
      break;
    case "center-panel":
      drawImageCover(ctx, img, 0, 0, width, height);
      drawCenterPanel(ctx, { title, body, brand, width, height, accentColor });
      break;
    case "side-bar":
      drawSideBar(ctx, img, { title, body, brand, width, height, accentColor });
      break;
    case "corner-badge":
      drawImageCover(ctx, img, 0, 0, width, height);
      drawCornerBadge(ctx, { title, body, brand, width, height, accentColor });
      break;
    case "bottom-left":
    default:
      drawImageCover(ctx, img, 0, 0, width, height);
      drawBottomLeft(ctx, { title, body, brand, width, height, accentColor });
      break;
  }

  return canvas.toDataURL("image/png");
}

interface TextBlockOpts {
  title: string;
  body?: string;
  brand?: string;
  width: number;
  height: number;
  accentColor: string;
}

function drawBottomLeft(ctx: CanvasRenderingContext2D, o: TextBlockOpts) {
  const { title, body, brand, width, height, accentColor } = o;
  addGradient(ctx, width, height, "bottom");

  const padding = Math.round(width * 0.07);
  const maxTextWidth = width - padding * 2;
  ctx.textAlign = "left";

  let titleSize = Math.round(width * 0.095);
  ctx.font = `700 ${titleSize}px "Space Grotesk", sans-serif`;
  let titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  while (titleLines.length > 3 && titleSize > width * 0.045) {
    titleSize -= 4;
    ctx.font = `700 ${titleSize}px "Space Grotesk", sans-serif`;
    titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  }

  const bodySize = Math.round(width * 0.032);
  ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
  const bodyLines = body ? wrapText(ctx, body, maxTextWidth) : [];

  const titleLineHeight = Math.round(titleSize * 1.08);
  const bodyLineHeight = Math.round(bodySize * 1.45);
  const accentH = Math.max(6, Math.round(width * 0.012));
  const gap = Math.round(titleSize * 0.4);

  const blockHeight =
    accentH + Math.round(titleSize * 0.35) +
    titleLines.length * titleLineHeight +
    (bodyLines.length ? gap + bodyLines.length * bodyLineHeight : 0);

  let cursorY = height - padding - blockHeight;

  ctx.fillStyle = accentColor;
  ctx.fillRect(padding, cursorY, Math.round(width * 0.14), accentH);
  cursorY += accentH + Math.round(titleSize * 0.55);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${titleSize}px "Space Grotesk", sans-serif`;
  for (const line of titleLines) { ctx.fillText(line, padding, cursorY); cursorY += titleLineHeight; }

  if (bodyLines.length) {
    cursorY += gap - Math.round(titleLineHeight * 0.5);
    ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (const line of bodyLines) { ctx.fillText(line, padding, cursorY); cursorY += bodyLineHeight; }
  }

  drawBrand(ctx, brand, padding, padding, width, "left");
}

function drawBottomCenter(ctx: CanvasRenderingContext2D, o: TextBlockOpts) {
  const { title, body, brand, width, height, accentColor } = o;
  addGradient(ctx, width, height, "bottom");

  const padding = Math.round(width * 0.1);
  const maxTextWidth = width - padding * 2;
  ctx.textAlign = "center";
  const cx = width / 2;

  let titleSize = Math.round(width * 0.09);
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  let titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  while (titleLines.length > 3 && titleSize > width * 0.045) {
    titleSize -= 4;
    ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
    titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  }

  const bodySize = Math.round(width * 0.03);
  ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
  const bodyLines = body ? wrapText(ctx, body, maxTextWidth) : [];

  const titleLineHeight = Math.round(titleSize * 1.1);
  const bodyLineHeight = Math.round(bodySize * 1.45);
  const dotR = Math.round(width * 0.012);
  const gap = Math.round(titleSize * 0.35);

  const blockHeight =
    dotR * 2 + Math.round(titleSize * 0.4) +
    titleLines.length * titleLineHeight +
    (bodyLines.length ? gap + bodyLines.length * bodyLineHeight : 0);

  let cursorY = height - padding - blockHeight;

  ctx.fillStyle = accentColor;
  ctx.beginPath(); ctx.arc(cx, cursorY, dotR, 0, Math.PI * 2); ctx.fill();
  cursorY += dotR * 2 + Math.round(titleSize * 0.5);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  for (const line of titleLines) { ctx.fillText(line, cx, cursorY); cursorY += titleLineHeight; }

  if (bodyLines.length) {
    cursorY += gap - Math.round(titleLineHeight * 0.5);
    ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const line of bodyLines) { ctx.fillText(line, cx, cursorY); cursorY += bodyLineHeight; }
  }

  drawBrand(ctx, brand, width / 2, height - Math.round(width * 0.04), width, "center");
}

function drawTopLeft(ctx: CanvasRenderingContext2D, o: TextBlockOpts) {
  const { title, body, brand, width, height, accentColor } = o;
  addGradient(ctx, width, height, "top");

  const padding = Math.round(width * 0.07);
  const maxTextWidth = width - padding * 2;
  ctx.textAlign = "left";

  let titleSize = Math.round(width * 0.085);
  ctx.font = `700 ${titleSize}px "Space Grotesk", sans-serif`;
  let titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  while (titleLines.length > 3 && titleSize > width * 0.04) {
    titleSize -= 4;
    ctx.font = `700 ${titleSize}px "Space Grotesk", sans-serif`;
    titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  }
  const bodySize = Math.round(width * 0.03);
  ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
  const bodyLines = body ? wrapText(ctx, body, maxTextWidth) : [];
  const titleLineHeight = Math.round(titleSize * 1.08);
  const bodyLineHeight = Math.round(bodySize * 1.4);
  const accentH = Math.max(6, Math.round(width * 0.012));

  let cursorY = padding + accentH + Math.round(titleSize * 0.9);
  ctx.fillStyle = accentColor;
  ctx.fillRect(padding, padding, Math.round(width * 0.14), accentH);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${titleSize}px "Space Grotesk", sans-serif`;
  for (const line of titleLines) { ctx.fillText(line, padding, cursorY); cursorY += titleLineHeight; }

  if (bodyLines.length) {
    cursorY += Math.round(titleSize * 0.25);
    ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (const line of bodyLines) { ctx.fillText(line, padding, cursorY); cursorY += bodyLineHeight; }
  }

  drawBrand(ctx, brand, padding, height - padding, width, "left");
}

function drawCenterPanel(ctx: CanvasRenderingContext2D, o: TextBlockOpts) {
  const { title, body, brand, width, height, accentColor } = o;

  const padding = Math.round(width * 0.1);
  const maxTextWidth = width - padding * 2;
  ctx.textAlign = "center";
  const cx = width / 2;

  let titleSize = Math.round(width * 0.1);
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  let titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  while (titleLines.length > 3 && titleSize > width * 0.05) {
    titleSize -= 4;
    ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
    titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  }
  const bodySize = Math.round(width * 0.032);
  ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
  const bodyLines = body ? wrapText(ctx, body, maxTextWidth) : [];
  const titleLineHeight = Math.round(titleSize * 1.12);
  const bodyLineHeight = Math.round(bodySize * 1.45);
  const gap = Math.round(titleSize * 0.4);

  const blockHeight = titleLines.length * titleLineHeight + (bodyLines.length ? gap + bodyLines.length * bodyLineHeight : 0);
  const panelPaddingY = Math.round(width * 0.06);
  const panelY = height / 2 - blockHeight / 2 - panelPaddingY;
  const panelH = blockHeight + panelPaddingY * 2;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, panelY, width, panelH);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, panelY, width, Math.max(4, Math.round(width * 0.008)));
  ctx.fillRect(0, panelY + panelH - Math.max(4, Math.round(width * 0.008)), width, Math.max(4, Math.round(width * 0.008)));

  let cursorY = panelY + panelPaddingY + titleSize * 0.85;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  for (const line of titleLines) { ctx.fillText(line, cx, cursorY); cursorY += titleLineHeight; }

  if (bodyLines.length) {
    cursorY += gap - Math.round(titleLineHeight * 0.5);
    ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    for (const line of bodyLines) { ctx.fillText(line, cx, cursorY); cursorY += bodyLineHeight; }
  }

  drawBrand(ctx, brand, width / 2, height - Math.round(width * 0.045), width, "center");
}

function drawSideBar(ctx: CanvasRenderingContext2D, img: HTMLImageElement, o: TextBlockOpts) {
  const { title, body, brand, width, height, accentColor } = o;
  const barW = Math.round(width * 0.4);

  drawImageCover(ctx, img, barW, 0, width - barW, height);

  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, barW, height);
  ctx.fillStyle = accentColor;
  ctx.fillRect(barW - Math.max(4, Math.round(width * 0.006)), 0, Math.max(4, Math.round(width * 0.006)), height);

  const padding = Math.round(width * 0.055);
  const maxTextWidth = barW - padding * 2;
  ctx.textAlign = "left";

  let titleSize = Math.round(width * 0.07);
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  let titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  while (titleLines.length > 5 && titleSize > width * 0.035) {
    titleSize -= 3;
    ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
    titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  }
  const bodySize = Math.round(width * 0.026);
  ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
  const bodyLines = body ? wrapText(ctx, body, maxTextWidth) : [];
  const titleLineHeight = Math.round(titleSize * 1.12);
  const bodyLineHeight = Math.round(bodySize * 1.5);
  const gap = Math.round(titleSize * 0.5);

  const blockHeight = titleLines.length * titleLineHeight + (bodyLines.length ? gap + bodyLines.length * bodyLineHeight : 0);
  let cursorY = height / 2 - blockHeight / 2 + titleSize * 0.85;

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  for (const line of titleLines) { ctx.fillText(line, padding, cursorY); cursorY += titleLineHeight; }

  if (bodyLines.length) {
    cursorY += gap - Math.round(titleLineHeight * 0.5);
    ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const line of bodyLines) { ctx.fillText(line, padding, cursorY); cursorY += bodyLineHeight; }
  }

  drawBrand(ctx, brand, padding, height - Math.round(width * 0.05), barW, "left");
}

function drawCornerBadge(ctx: CanvasRenderingContext2D, o: TextBlockOpts) {
  const { title, body, brand, width, height, accentColor } = o;
  const padding = Math.round(width * 0.06);
  const badgeW = Math.round(width * 0.7);
  const badgeX = padding;

  ctx.textAlign = "left";
  let titleSize = Math.round(width * 0.065);
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  const maxTextWidth = badgeW - padding * 1.4;
  let titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  while (titleLines.length > 3 && titleSize > width * 0.035) {
    titleSize -= 3;
    ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
    titleLines = wrapText(ctx, title.toUpperCase(), maxTextWidth);
  }
  const bodySize = Math.round(width * 0.026);
  ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
  const bodyLines = body ? wrapText(ctx, body, maxTextWidth) : [];
  const titleLineHeight = Math.round(titleSize * 1.1);
  const bodyLineHeight = Math.round(bodySize * 1.45);
  const gap = Math.round(titleSize * 0.35);
  const badgePadding = Math.round(width * 0.045);

  const blockHeight = titleLines.length * titleLineHeight + (bodyLines.length ? gap + bodyLines.length * bodyLineHeight : 0);
  const badgeH = blockHeight + badgePadding * 2;
  const badgeY = height - padding - badgeH;

  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, Math.round(width * 0.03));
  ctx.fillStyle = "rgba(10,10,14,0.82)";
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = Math.max(2, Math.round(width * 0.003));
  ctx.stroke();

  let cursorY = badgeY + badgePadding + titleSize * 0.85;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titleSize}px "Space Grotesk", sans-serif`;
  for (const line of titleLines) { ctx.fillText(line, badgeX + badgePadding, cursorY); cursorY += titleLineHeight; }

  if (bodyLines.length) {
    cursorY += gap - Math.round(titleLineHeight * 0.5);
    ctx.font = `400 ${bodySize}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const line of bodyLines) { ctx.fillText(line, badgeX + badgePadding, cursorY); cursorY += bodyLineHeight; }
  }

  drawBrand(ctx, brand, padding, padding, width, "left");
}

function addGradient(ctx: CanvasRenderingContext2D, width: number, height: number, side: "top" | "bottom") {
  const gradient = side === "bottom"
    ? ctx.createLinearGradient(0, height * 0.4, 0, height)
    : ctx.createLinearGradient(0, 0, 0, height * 0.6);
  if (side === "bottom") {
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.88)");
  } else {
    gradient.addColorStop(0, "rgba(0,0,0,0.85)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawBrand(
  ctx: CanvasRenderingContext2D,
  brand: string | undefined,
  x: number,
  y: number,
  width: number,
  align: "left" | "center",
) {
  if (!brand) return;
  ctx.textAlign = align;
  ctx.font = `600 ${Math.round(width * 0.024)}px "Inter", sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(brand, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar a imagem base."));
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function ensureFontsLoaded() {
  try {
    await Promise.all([
      document.fonts.load('700 60px "Space Grotesk"'),
      document.fonts.load('800 60px "Space Grotesk"'),
      document.fonts.load('400 30px "Inter"'),
      document.fonts.load('600 30px "Inter"'),
    ]);
  } catch {
    // Se a fonte não carregar a tempo, o Canvas cai para a fonte padrão do sistema.
  }
}
