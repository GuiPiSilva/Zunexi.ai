export type AgencyModuleId =
  | "strategy"
  | "branding"
  | "social"
  | "content"
  | "design"
  | "video"
  | "photography"
  | "paid_media"
  | "seo"
  | "website"
  | "ecommerce"
  | "email"
  | "crm"
  | "automation"
  | "whatsapp"
  | "influencers"
  | "reputation"
  | "local_marketing"
  | "b2b"
  | "prospecting"
  | "events"
  | "pr"
  | "research"
  | "analytics"
  | "cro"
  | "campaigns"
  | "sales_enablement"
  | "growth"
  | "ai_marketing";

export type AgencyModuleDefinition = {
  id: AgencyModuleId;
  slug: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  outputs: string[];
  route?: string;
};

export const AGENCY_MODULES: AgencyModuleDefinition[] = [
  { id: "strategy", slug: "estrategia", name: "Estratégia de marketing", shortName: "Estratégia", category: "Estratégia", description: "Posicionamento, público, personas, proposta de valor, metas, KPIs e plano de crescimento.", outputs: ["Diagnóstico", "Plano estratégico", "KPIs", "Roadmap"] },
  { id: "branding", slug: "branding", name: "Branding e identidade", shortName: "Branding", category: "Marca", description: "Posicionamento, voz, identidade, slogans, arquitetura de marca e consistência visual.", outputs: ["Posicionamento", "Tom de voz", "Direção visual", "Brand checklist"], route: "/brand-kit" },
  { id: "social", slug: "redes-sociais", name: "Gestão de redes sociais", shortName: "Redes sociais", category: "Social", description: "Canais, calendário editorial, formatos, frequência, comunidade e publicação.", outputs: ["Plano de canais", "Calendário", "Pautas", "Rotina de gestão"], route: "/publicacoes" },
  { id: "content", slug: "conteudo", name: "Conteúdo e copywriting", shortName: "Conteúdo", category: "Criação", description: "Ideias, artigos, legendas, roteiros, campanhas, landing pages e materiais ricos.", outputs: ["Pilares", "Pautas", "Copies", "CTAs"], route: "/carrossel" },
  { id: "design", slug: "design", name: "Design e criativos", shortName: "Design", category: "Criação", description: "Direção de arte, peças, anúncios, apresentações, catálogos e materiais promocionais.", outputs: ["Direção de arte", "Lista de peças", "Briefings", "Specs"], route: "/cartaz" },
  { id: "video", slug: "video", name: "Vídeo e audiovisual", shortName: "Vídeo", category: "Criação", description: "Roteiros, reels, shorts, vídeos institucionais, motion e distribuição por formato.", outputs: ["Roteiros", "Shot list", "Edição", "Distribuição"] },
  { id: "photography", slug: "fotografia", name: "Fotografia e imagem", shortName: "Fotografia", category: "Criação", description: "Planejamento de fotos de produto, lifestyle, corporativo, tratamento e IA visual.", outputs: ["Shot list", "Cenários", "Referências", "Pós-produção"] },
  { id: "paid_media", slug: "trafego-pago", name: "Tráfego pago", shortName: "Tráfego pago", category: "Aquisição", description: "Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, remarketing e testes A/B.", outputs: ["Estrutura de campanha", "Públicos", "Criativos", "Métricas"] },
  { id: "seo", slug: "seo", name: "SEO", shortName: "SEO", category: "Aquisição", description: "Palavras-chave, SEO técnico, on-page, local, conteúdo, links e plano de autoridade.", outputs: ["Keywords", "Auditoria", "Plano on-page", "Backlog SEO"] },
  { id: "website", slug: "sites-landing-pages", name: "Sites e landing pages", shortName: "Sites e landing pages", category: "Digital", description: "Arquitetura, páginas, copy, CRO, formulários, pixels, analytics e manutenção.", outputs: ["Sitemap", "Wireframe textual", "Copy", "Checklist técnico"] },
  { id: "ecommerce", slug: "ecommerce", name: "E-commerce", shortName: "E-commerce", category: "Digital", description: "Catálogo, páginas de produto, carrinho, upsell, cross-sell, remarketing e retenção.", outputs: ["Plano de loja", "PDP", "Ofertas", "Recuperação"] },
  { id: "email", slug: "email-marketing", name: "E-mail marketing", shortName: "E-mail marketing", category: "Relacionamento", description: "Newsletters, boas-vindas, abandono, pós-venda, reativação, segmentação e testes.", outputs: ["Fluxos", "Sequências", "Assuntos", "Métricas"] },
  { id: "crm", slug: "crm", name: "CRM e gestão de leads", shortName: "CRM", category: "Vendas", description: "Pipeline, segmentação, lead scoring, follow-up, distribuição e integração comercial.", outputs: ["Pipeline", "Etapas", "Scoring", "SLA"] },
  { id: "automation", slug: "automacao", name: "Automação de marketing", shortName: "Automação", category: "Operação", description: "Gatilhos, fluxos, regras, notificações, follow-ups e rotinas automáticas.", outputs: ["Mapa de automações", "Gatilhos", "Ações", "Exceções"], route: "/automacoes" },
  { id: "whatsapp", slug: "whatsapp", name: "WhatsApp e atendimento", shortName: "WhatsApp", category: "Relacionamento", description: "Atendimento, qualificação, mensagens, suporte, pós-venda e recuperação.", outputs: ["Fluxo de atendimento", "Scripts", "Qualificação", "SLA"] },
  { id: "influencers", slug: "influencia", name: "Marketing de influência", shortName: "Influência", category: "Aquisição", description: "Perfil ideal, seleção, briefing, negociação, rastreio e medição de ROI.", outputs: ["Perfil de creator", "Briefing", "Modelo de campanha", "KPIs"] },
  { id: "reputation", slug: "reputacao", name: "Reputação e comunidade", shortName: "Reputação", category: "Relacionamento", description: "Avaliações, reclamações, NPS, crise, comunidade, fidelização e respostas públicas.", outputs: ["Playbook", "Matriz de resposta", "NPS", "Plano de crise"], route: "/caixa-entrada" },
  { id: "local_marketing", slug: "marketing-local", name: "Marketing local", shortName: "Marketing local", category: "Aquisição", description: "Google Business, Maps, avaliações, geolocalização, promoções e presença física.", outputs: ["Checklist local", "Plano GBP", "Campanhas", "Avaliações"] },
  { id: "b2b", slug: "marketing-b2b", name: "Marketing B2B", shortName: "Marketing B2B", category: "Vendas", description: "LinkedIn, ABM, conteúdo para decisores, materiais, webinars e geração de demanda.", outputs: ["ICP", "ABM", "Conteúdo", "Cadência"] },
  { id: "prospecting", slug: "prospeccao", name: "Prospecção comercial", shortName: "Prospecção", category: "Vendas", description: "ICP, lista-alvo, mensagens, qualificação, follow-up e agendamento de reuniões.", outputs: ["ICP", "Cadência", "Mensagens", "Qualificação"] },
  { id: "events", slug: "eventos", name: "Marketing de eventos", shortName: "Eventos", category: "Campanhas", description: "Conceito, inscrições, divulgação, mídia, cobertura, leads e pós-evento.", outputs: ["Plano do evento", "Timeline", "Peças", "Captação"] },
  { id: "pr", slug: "assessoria-comunicacao", name: "Assessoria de comunicação", shortName: "Assessoria", category: "Marca", description: "Releases, imprensa, comunicados, media kit, press kit e gestão de crise.", outputs: ["Narrativa", "Pautas", "Release", "Plano de mídia"] },
  { id: "research", slug: "inteligencia-mercado", name: "Pesquisa e inteligência", shortName: "Inteligência de mercado", category: "Estratégia", description: "Mercado, concorrentes, benchmarking, tendências, SWOT e oportunidades.", outputs: ["SWOT", "Benchmark", "Tendências", "Oportunidades"] },
  { id: "analytics", slug: "analytics-bi", name: "Analytics e BI", shortName: "Analytics e BI", category: "Dados", description: "Dashboards, funil, CAC, LTV, ROAS, CPL, CPA, CTR e recomendações.", outputs: ["Métricas", "Dashboard", "Diagnóstico", "Ações"], route: "/analytics" },
  { id: "cro", slug: "cro", name: "CRO e conversão", shortName: "CRO", category: "Dados", description: "Funis, páginas, CTAs, formulários, checkout, testes A/B e redução de abandono.", outputs: ["Auditoria CRO", "Hipóteses", "Testes", "Priorização"] },
  { id: "campaigns", slug: "campanhas", name: "Campanhas e promoções", shortName: "Campanhas", category: "Campanhas", description: "Datas sazonais, lançamentos, promoções, cupons, indicação e fidelidade.", outputs: ["Conceito", "Oferta", "Canais", "Cronograma"] },
  { id: "sales_enablement", slug: "materiais-vendas", name: "Materiais para vendas", shortName: "Materiais para vendas", category: "Vendas", description: "Apresentações, propostas, scripts, objeções, cases e materiais de apoio.", outputs: ["Pitch", "Objeções", "Proposta", "Materiais"] },
  { id: "growth", slug: "growth", name: "Growth marketing", shortName: "Growth", category: "Estratégia", description: "Experimentos, loops, referral, retenção, churn, upsell, cross-sell e expansão.", outputs: ["North Star", "Experimentos", "Loops", "Backlog"] },
  { id: "ai_marketing", slug: "ia-marketing", name: "IA aplicada ao marketing", shortName: "IA para marketing", category: "Operação", description: "Agentes, geração, análise, personalização, automações e produtividade da equipe.", outputs: ["Mapa de IA", "Agentes", "Automação", "Governança"] },
];

export const AGENCY_CATEGORIES = Array.from(new Set(AGENCY_MODULES.map((item) => item.category)));

export function getAgencyModule(id: AgencyModuleId) {
  return AGENCY_MODULES.find((item) => item.id === id) || AGENCY_MODULES[0];
}

export function getAgencyModuleBySlug(slug: string) {
  return AGENCY_MODULES.find((item) => item.slug === slug) || null;
}
