export type PlanId = "essencial" | "profissional" | "agencia";

export type PlanFeature =
  | "carrossel"
  | "cartaz"
  | "biblioteca"
  | "projetos"
  | "criador_prompts"
  | "brand_kit"
  | "agenda"
  | "prioridade_geracao"
  | "multiplas_marcas"
  | "uso_comercial_ampliado";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  creditsPerMonth: number;
  description: string;
  features: PlanFeature[];
  highlights: string[];
};

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  essencial: {
    id: "essencial",
    name: "Essencial",
    creditsPerMonth: 30,
    description: "Para começar a criar conteúdo profissional com IA.",
    features: ["carrossel", "cartaz", "biblioteca", "projetos"],
    highlights: ["30 créditos por mês", "Carrosséis e cartazes", "Biblioteca de projetos"],
  },
  profissional: {
    id: "profissional",
    name: "Profissional",
    creditsPerMonth: 100,
    description: "Para quem publica com frequência e precisa de organização de marca.",
    features: [
      "carrossel",
      "cartaz",
      "biblioteca",
      "projetos",
      "criador_prompts",
      "brand_kit",
      "agenda",
      "prioridade_geracao",
    ],
    highlights: [
      "100 créditos por mês",
      "Brand Kit inteligente",
      "Prioridade na geração",
      "Criador de prompts",
      "Agenda de postagens",
    ],
  },
  agencia: {
    id: "agencia",
    name: "Agência",
    creditsPerMonth: 300,
    description: "Para equipes e operações com várias marcas e clientes.",
    features: [
      "carrossel",
      "cartaz",
      "biblioteca",
      "projetos",
      "criador_prompts",
      "brand_kit",
      "agenda",
      "prioridade_geracao",
      "multiplas_marcas",
      "uso_comercial_ampliado",
    ],
    highlights: [
      "300 créditos por mês",
      "Múltiplas marcas",
      "Uso comercial ampliado",
      "Criador de prompts",
      "Agenda de postagens",
    ],
  },
};

export function normalizePlan(value: unknown): PlanId {
  return value === "profissional" || value === "agencia" ? value : "essencial";
}

export function getPlanDefinition(value: unknown) {
  return PLAN_DEFINITIONS[normalizePlan(value)];
}

export function planHasFeature(plan: unknown, feature: PlanFeature) {
  return getPlanDefinition(plan).features.includes(feature);
}
