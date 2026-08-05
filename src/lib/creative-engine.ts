import { LAYOUT_IDS, layoutForSlide, type ElementDesc, type LayoutId } from "@/lib/layouts";

export type CreativeTextZone = "left" | "right" | "top" | "bottom" | "center";

export interface CreativeSlideLike {
  titulo?: string;
  title?: string;
  texto?: string;
  body?: string;
  tipo?: string;
  layout?: string;
  textZone?: string;
}

export interface LayoutReview {
  approved: boolean;
  score: number;
  warnings: string[];
  repaired: boolean;
}

const HUMAN_VISUAL_REQUEST = [
  /\b(?:mostrar|mostre|inclua|incluir|adicione|adicionar|usar|use|coloque|com)\s+(?:uma?|duas?|alguns?|algumas?)?\s*(?:pessoa|pessoas|homem|homens|mulher|mulheres|crian[cç]a|crian[cç]as|jovem|jovens|casal|fam[ií]lia|modelo|modelos|cliente|clientes|equipe|profissional|profissionais)\b/i,
  /\b(?:retrato|portrait|ensaio\s+fotogr[aá]fico|modelo\s+fotogr[aá]fico|rosto\s+humano|human\s+face|full\s+body|pessoa\s+aparecendo)\b/i,
  /\b(?:influenciador|influenciadora|ator|atriz|cantor|cantora|palestrante|pastor|pastora)\s+(?:aparecendo|na\s+imagem|no\s+post|em\s+destaque)\b/i,
];

export function explicitHumanVisualRequest(...values: Array<string | undefined | null>) {
  const source = values.filter(Boolean).join("\n");
  return HUMAN_VISUAL_REQUEST.some((pattern) => pattern.test(source));
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === "string" && (LAYOUT_IDS as readonly string[]).includes(value);
}

function denseCopy(title: string, body: string) {
  return body.length > 240 || body.split(/\n+/).filter(Boolean).length >= 7 ||
    /card[aá]pio|menu|cat[aá]logo|lista|tabela|pre[cç]o|sabores|pizzas|bebidas|promo[cç][aã]o/i.test(`${title}\n${body}`);
}

function candidatesForRole(kind: string): LayoutId[] {
  const role = kind.toLowerCase();
  if (role.includes("capa")) return ["text-over-image", "side-text", "bottom-text", "diagonal", "hero-image"];
  if (role.includes("cta")) return ["center-text", "bottom-text", "text-over-image", "side-text"];
  return ["side-text", "hero-image", "bottom-text", "diagonal", "text-over-image", "center-text"];
}

/**
 * Resolve os layouts de toda a campanha de uma vez. A preferência sugerida pela
 * IA é respeitada, mas layouts consecutivos iguais são trocados para impedir
 * carrosséis visualmente repetitivos.
 */
export function resolveCampaignLayouts(slides: CreativeSlideLike[]): LayoutId[] {
  const resolved: LayoutId[] = [];

  slides.forEach((slide, index) => {
    const title = String(slide.titulo ?? slide.title ?? "");
    const body = String(slide.texto ?? slide.body ?? "");
    const kind = String(slide.tipo ?? "conteudo");

    if (denseCopy(title, body)) {
      resolved.push("menu-board");
      return;
    }

    const preferred = isLayoutId(slide.layout)
      ? slide.layout
      : layoutForSlide(index, kind, title, body);
    const candidates = candidatesForRole(kind);
    const ordered = [preferred, ...candidates].filter((item, itemIndex, all) => all.indexOf(item) === itemIndex);
    const last = resolved.at(-1);
    const recent = new Set(resolved.slice(-2));

    if (preferred !== last && !recent.has(preferred)) {
      resolved.push(preferred);
      return;
    }

    const alternatives = ordered.filter((candidate) => candidate !== preferred);
    const start = hashText(`${title}|${body}|${index}`) % Math.max(1, alternatives.length);
    const rotated = [...alternatives.slice(start), ...alternatives.slice(0, start)];
    const chosen = rotated.find((candidate) => candidate !== last && !recent.has(candidate))
      ?? rotated.find((candidate) => candidate !== last)
      ?? preferred;
    resolved.push(chosen);
  });

  return resolved;
}

function estimatedTextHeight(element: Extract<ElementDesc, { kind: "text" }>) {
  const charsPerLine = Math.max(4, Math.floor(element.w / Math.max(1, element.size * 0.54)));
  const explicitLines = element.text.split(/\n/);
  const lines = explicitLines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return lines * element.size * (element.lineHeight ?? 1.15);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Revisor geométrico da arte final. Ele garante que texto, imagens e formas
 * permaneçam dentro do canvas e reduz a tipografia quando um bloco ultrapassa
 * a margem segura. Isso funciona mesmo sem uma API de visão adicional.
 */
export function reviewAndRepairElements(
  source: ElementDesc[],
  width: number,
  height: number,
): { elements: ElementDesc[]; review: LayoutReview } {
  const warnings: string[] = [];
  let repaired = false;
  const safe = Math.max(20, Math.round(Math.min(width, height) * 0.035));

  const elements = source.map((original): ElementDesc => {
    const element = { ...original } as ElementDesc;

    if (element.kind === "rect" || element.kind === "image") {
      const isFullBleed = element.x <= 1 && element.y <= 1 && element.w >= width - 2 && element.h >= height - 2;
      if (!isFullBleed) {
        const old = `${element.x}|${element.y}|${element.w}|${element.h}`;
        element.x = clamp(element.x, 0, width);
        element.y = clamp(element.y, 0, height);
        element.w = clamp(element.w, 1, width - element.x);
        element.h = clamp(element.h, 1, height - element.y);
        if (old !== `${element.x}|${element.y}|${element.w}|${element.h}`) {
          warnings.push(`${element.name || element.role || element.kind} reposicionado dentro do canvas`);
          repaired = true;
        }
      }
      return element;
    }

    if (element.kind === "circle") {
      const originalCircle = `${element.cx}|${element.cy}|${element.r}`;
      element.r = clamp(element.r, 1, Math.min(width, height));
      element.cx = clamp(element.cx, -element.r, width + element.r);
      element.cy = clamp(element.cy, -element.r, height + element.r);
      if (originalCircle !== `${element.cx}|${element.cy}|${element.r}`) repaired = true;
      return element;
    }

    const isBrand = element.role === "brand" || element.name?.toLowerCase().includes("marca");
    const margin = isBrand ? Math.max(10, safe * 0.5) : safe;
    const originalText = `${element.x}|${element.y}|${element.w}|${element.size}`;
    element.x = clamp(element.x, margin, Math.max(margin, width - margin));
    element.w = clamp(element.w, 80, Math.max(80, width - margin - element.x));
    element.y = clamp(element.y, margin, Math.max(margin, height - margin));

    const minSize = element.role === "title" ? 30 : isBrand ? 16 : 18;
    let estimatedHeight = estimatedTextHeight(element);
    while (element.y + estimatedHeight > height - margin && element.size > minSize) {
      element.size = Math.max(minSize, element.size - 2);
      estimatedHeight = estimatedTextHeight(element);
    }
    if (element.y + estimatedHeight > height - margin) {
      element.y = Math.max(margin, height - margin - estimatedHeight);
    }

    if (originalText !== `${element.x}|${element.y}|${element.w}|${element.size}`) {
      warnings.push(`${element.name || element.role || "Texto"} ajustado à margem segura`);
      repaired = true;
    }
    return element;
  });

  const title = elements.find((element): element is Extract<ElementDesc, { kind: "text" }> => element.kind === "text" && element.role === "title");
  const body = elements.find((element): element is Extract<ElementDesc, { kind: "text" }> => element.kind === "text" && element.role === "body");
  if (title && body) {
    const titleBottom = title.y + estimatedTextHeight(title);
    const horizontalOverlap = title.x < body.x + body.w && body.x < title.x + title.w;
    if (horizontalOverlap && body.y < titleBottom + 14) {
      const bodyHeight = estimatedTextHeight(body);
      const maxBodyY = Math.max(safe, height - safe - bodyHeight);
      body.y = clamp(titleBottom + 20, safe, maxBodyY);
      warnings.push("Texto secundário afastado do título para evitar sobreposição");
      repaired = true;
    }
  }

  const uniqueWarnings = warnings.filter((warning, index, all) => all.indexOf(warning) === index);
  const score = Math.max(70, 100 - uniqueWarnings.length * 6);
  return {
    elements,
    review: {
      approved: score >= 76,
      score,
      warnings: uniqueWarnings,
      repaired,
    },
  };
}
