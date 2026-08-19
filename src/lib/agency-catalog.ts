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
  name: string;
  category: string;
  description: string;
  outputs: string[];
  route?: string;
};

export const AGENCY_MODULES: AgencyModuleDefinition[] = [
  { id: "strategy", name: "Estratégia de marketing", category: "Estratégia", description: "Posicionamento, público, personas, proposta de valor, metas, KPIs e plano de crescimento.", outputs: ["Diagnóstico", "Plano estratégico", "KPIs", "Roadmap"] },
  { id: "branding", name: "Branding e identidade", category: "Marca", description: "Posicionamento, voz, identidade, slogans, arquitetura de marca e consistência visual.", outputs: ["Posicionamento", "Tom de voz", "Direção visual", "Brand checklist"], route: "/brand-kit" },
  { id: "social", name: "Gestão de redes sociais", category: "Social", description: "Canais, calendário editorial, formatos, frequência, comunidade e publicação.", outputs: ["Plano de canais", "Calendário", "Pautas", "Rotina de gestão"], route: "/publicacoes" },
  { id: "content", name: "Conteúdo e copywriting", category: "Criação", description: "Ideias, artigos, legendas, roteiros, campanhas, landing pages e materiais ricos.", outputs: ["Pilares", "Pautas", "Copies", "CTAs"], route: "/carrossel" },
  { id: "design", name: "Design e criativos", category: "Criação", description: "Direção de arte, peças, anúncios, apresentações, catálogos e materiais promocionais.", outputs: ["Direção de arte", "Lista de peças", "Briefings", "Specs"], route: "/cartaz" },
  { id: "video", name: "Vídeo e audiovisual", category: "Criação", description: "Roteiros, reels, shorts, vídeos institucionais, motion e distribuição por formato.", outputs: ["Roteiros", "Shot list", "Edição", "Distribuição"] },
  { id: "photography", name: "Fotografia e imagem", category: "Criação", description: "Planejamento de fotos de produto, lifestyle, corporativo, tratamento e IA visual.", outputs: ["Shot list", "Cenários", "Referências", "Pós-produção"] },
  { id: "paid_media", name: "Tráfego pago", category: "Aquisição", description: "Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, remarketing e testes A/B.", outputs: ["Estrutura de campanha", "Públicos", "Criativos", "Métricas"] },
  { id: "seo", name: "SEO", category: "Aquisição", description: "Palavras-chave, SEO técnico, on-page, local, conteúdo, links e plano de autoridade.", outputs: ["Keywords", "Auditoria", "Plano on-page", "Backlog SEO"] },
  { id: "website", name: "Sites e landing pages", category: "Digital", description: "Arquitetura, páginas, copy, CRO, formulários, pixels, analytics e manutenção.", outputs: ["Sitemap", "Wireframe textual", "Copy", "Checklist técnico"] },
  { id: "ecommerce", name: "E-commerce", category: "Digital", description: "Catálogo, páginas de produto, carrinho, upsell, cross-sell, remarketing e retenção.", outputs: ["Plano de loja", "PDP", "Ofertas", "Recuperação"] },
  { id: "email", name: "E-mail marketing", category: "Relacionamento", description: "Newsletters, boas-vindas, abandono, pós-venda, reativação, segmentação e testes.", outputs: ["Fluxos", "Sequências", "Assuntos", "Métricas"] },
  { id: "crm", name: "CRM e gestão de leads", category: "Vendas", description: "Pipeline, segmentação, lead scoring, follow-up, distribuição e integração comercial.", outputs: ["Pipeline", "Etapas", "Scoring", "SLA"] },
  { id: "automation", name: "Automação de marketing", category: "Operação", description: "Gatilhos, fluxos, regras, notificações, follow-ups e rotinas automáticas.", outputs: ["Mapa de automações", "Gatilhos", "Ações", "Exceções"], route: "/automacoes" },
  { id: "whatsapp", name: "WhatsApp e atendimento", category: "Relacionamento", description: "Atendimento, qualificação, mensagens, suporte, pós-venda e recuperação.", outputs: ["Fluxo de atendimento", "Scripts", "Qualificação", "SLA"] },
  { id: "influencers", name: "Marketing de influência", category: "Aquisição", description: "Perfil ideal, seleção, briefing, negociação, rastreio e medição de ROI.", outputs: ["Perfil de creator", "Briefing", "Modelo de campanha", "KPIs"] },
  { id: "reputation", name: "Reputação e comunidade", category: "Relacionamento", description: "Avaliações, reclamações, NPS, crise, comunidade, fidelização e respostas públicas.", outputs: ["Playbook", "Matriz de resposta", "NPS", "Plano de crise"], route: "/caixa-entrada" },
  { id: "local_marketing", name: "Marketing local", category: "Aquisição", description: "Google Business, Maps, avaliações, geolocalização, promoções e presença física.", outputs: ["Checklist local", "Plano GBP", "Campanhas", "Avaliações"] },
  { id: "b2b", name: "Marketing B2B", category: "Vendas", description: "LinkedIn, ABM, conteúdo para decisores, materiais, webinars e geração de demanda.", outputs: ["ICP", "ABM", "Conteúdo", "Cadência"] },
  { id: "prospecting", name: "Prospecção comercial", category: "Vendas", description: "ICP, lista-alvo, mensagens, qualificação, follow-up e agendamento de reuniões.", outputs: ["ICP", "Cadência", "Mensagens", "Qualificação"] },
  { id: "events", name: "Marketing de eventos", category: "Campanhas", description: "Conceito, inscrições, divulgação, mídia, cobertura, leads e pós-evento.", outputs: ["Plano do evento", "Timeline", "Peças", "Captação"] },
  { id: "pr", name: "Assessoria de comunicação", category: "Marca", description: "Releases, imprensa, comunicados, media kit, press kit e gestão de crise.", outputs: ["Narrativa", "Pautas", "Release", "Plano de mídia"] },
  { id: "research", name: "Pesquisa e inteligência", category: "Estratégia", description: "Mercado, concorrentes, benchmarking, tendências, SWOT e oportunidades.", outputs: ["SWOT", "Benchmark", "Tendências", "Oportunidades"] },
  { id: "analytics", name: "Analytics e BI", category: "Dados", description: "Dashboards, funil, CAC, LTV, ROAS, CPL, CPA, CTR e recomendações.", outputs: ["Métricas", "Dashboard", "Diagnóstico", "Ações"], route: "/analytics" },
  { id: "cro", name: "CRO e conversão", category: "Dados", description: "Funis, páginas, CTAs, formulários, checkout, testes A/B e redução de abandono.", outputs: ["Auditoria CRO", "Hipóteses", "Testes", "Priorização"] },
  { id: "campaigns", name: "Campanhas e promoções", category: "Campanhas", description: "Datas sazonais, lançamentos, promoções, cupons, indicação e fidelidade.", outputs: ["Conceito", "Oferta", "Canais", "Cronograma"] },
  { id: "sales_enablement", name: "Materiais para vendas", category: "Vendas", description: "Apresentações, propostas, scripts, objeções, cases e materiais de apoio.", outputs: ["Pitch", "Objeções", "Proposta", "Materiais"] },
  { id: "growth", name: "Growth marketing", category: "Estratégia", description: "Experimentos, loops, referral, retenção, churn, upsell, cross-sell e expansão.", outputs: ["North Star", "Experimentos", "Loops", "Backlog"] },
  { id: "ai_marketing", name: "IA aplicada ao marketing", category: "Operação", description: "Agentes, geração, análise, personalização, automações e produtividade da equipe.", outputs: ["Mapa de IA", "Agentes", "Automação", "Governança"] },
];

export const AGENCY_CATEGORIES = Array.from(new Set(AGENCY_MODULES.map((item) => item.category)));

export function getAgencyModule(id: AgencyModuleId) {
  return AGENCY_MODULES.find((item) => item.id === id) || AGENCY_MODULES[0];
}
