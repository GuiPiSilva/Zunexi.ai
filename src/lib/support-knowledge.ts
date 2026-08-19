export type SupportCategory =
  | "primeiros-passos"
  | "criacao"
  | "marca"
  | "planejamento"
  | "redes-sociais"
  | "conta-planos"
  | "erros";

export type SupportArticle = {
  id: string;
  title: string;
  category: SupportCategory;
  summary: string;
  route?: string;
  keywords: string[];
  steps: string[];
  important?: string;
};

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  "primeiros-passos": "Primeiros passos",
  criacao: "Criação com IA",
  marca: "Marca e arquivos",
  planejamento: "Planejamento",
  "redes-sociais": "Redes sociais",
  "conta-planos": "Conta e planos",
  erros: "Erros e correções",
};

export const SUPPORT_QUICK_QUESTIONS = [
  "Como criar meu primeiro carrossel?",
  "Minha imagem não foi gerada",
  "A Groq retornou um erro",
  "Como conectar o Instagram?",
  "Meus créditos acabaram",
  "O sistema ficou carregando",
];

export const SUPPORT_ARTICLES: SupportArticle[] = [
  {
    id: "visao-geral",
    title: "O que é possível fazer na Zunexi.ai",
    category: "primeiros-passos",
    summary:
      "Visão completa das áreas de criação, marca, planejamento, publicação e análise.",
    route: "/",
    keywords: [
      "funções",
      "recursos",
      "o que faz",
      "começar",
      "sistema",
      "zunexi",
    ],
    steps: [
      "Crie carrosséis, cartazes, textos e briefings com inteligência artificial.",
      "Organize identidade visual, documentos e marcas no Brand Kit.",
      "Salve artes em Projetos e imagens na Biblioteca.",
      "Revise conteúdos, planeje datas, agende e publique nas redes conectadas.",
      "Centralize mensagens, comentários, métricas, equipe e automações, conforme o plano contratado.",
    ],
  },
  {
    id: "dashboard",
    title: "Usar o Dashboard",
    category: "primeiros-passos",
    summary:
      "Acompanhe créditos, projetos, agenda, contas conectadas e ações rápidas.",
    route: "/",
    keywords: ["dashboard", "início", "painel", "resumo", "métricas"],
    steps: [
      "Confira o plano e os créditos disponíveis no cartão principal.",
      "Use Ações rápidas para abrir a ferramenta desejada.",
      "Veja os próximos posts e retome projetos recentes na mesma tela.",
    ],
  },
  {
    id: "criar-carrossel",
    title: "Criar um carrossel com IA",
    category: "criacao",
    summary: "Gere uma sequência com narrativa, textos, layouts e imagens.",
    route: "/carrossel",
    keywords: [
      "carrossel",
      "slides",
      "instagram",
      "gerar conteúdo",
      "narrativa",
    ],
    steps: [
      "Abra Criar carrossel e descreva claramente o tema, objetivo e público.",
      "Escolha a quantidade de slides, o tom e, se disponível, uma marca do Brand Kit.",
      "Inclua informações obrigatórias, como oferta, data ou chamada para ação, no campo adicional.",
      "Gere o conteúdo e revise cada título e texto antes de criar ou trocar as imagens.",
      "Abra a arte pronta para editar, salvar no projeto e exportar.",
    ],
    important:
      "Evite colar instruções enormes ou repetidas. Um briefing direto produz resultados melhores e reduz erros de limite.",
  },
  {
    id: "criar-cartaz",
    title: "Criar um cartaz",
    category: "criacao",
    summary: "Monte uma arte única para promoção, evento ou comunicado.",
    route: "/cartaz",
    keywords: ["cartaz", "post único", "arte", "evento", "promoção"],
    steps: [
      "Abra Criar cartaz e informe o tema e o objetivo da peça.",
      "Selecione a marca correta para aplicar cores e linguagem do Brand Kit.",
      "Informe textos que precisam aparecer exatamente na composição.",
      "Gere, revise no editor e exporte a versão final.",
    ],
  },
  {
    id: "criador-prompts",
    title: "Usar o Criador de prompts",
    category: "criacao",
    summary:
      "Transforme uma ideia curta em um briefing criativo mais completo.",
    route: "/criador-prompts",
    keywords: ["prompt", "briefing", "ideia", "melhorar pedido"],
    steps: [
      "Escreva o resultado que deseja, o público e o objetivo.",
      "Escolha uma marca para usar o contexto do Brand Kit, quando disponível.",
      "Gere o briefing e revise informações inventadas antes de utilizá-lo.",
      "Se o pedido ficar muito grande, remova repetições e mantenha apenas requisitos essenciais.",
    ],
  },
  {
    id: "editor-exportacao",
    title: "Editar e exportar uma arte",
    category: "criacao",
    summary: "Ajuste elementos da composição e baixe o resultado final.",
    route: "/projetos",
    keywords: [
      "editor",
      "editar",
      "exportar",
      "png",
      "jpg",
      "psd",
      "baixar",
      "texto",
    ],
    steps: [
      "Abra Meus projetos e selecione a arte desejada.",
      "Clique no elemento para mover, redimensionar ou alterar suas propriedades.",
      "Revise se os textos estão dentro da área segura e sem sobreposição.",
      "Use a opção de exportação desejada e aguarde o navegador concluir o download.",
    ],
    important:
      "Se o download não começar, permita downloads para o domínio da Zunexi.ai e tente novamente.",
  },
  {
    id: "brand-kit",
    title: "Configurar o Brand Kit",
    category: "marca",
    summary:
      "Cadastre cores, tipografia, voz, referências e regras de cada marca.",
    route: "/brand-kit",
    keywords: [
      "brand kit",
      "marca",
      "cores",
      "fonte",
      "tipografia",
      "logo",
      "identidade",
    ],
    steps: [
      "Abra Brand Kit e crie ou selecione uma marca.",
      "Cadastre cores, tom de voz, público, estilo visual e regras importantes.",
      "Envie o guia da marca em PDF, se o seu plano permitir.",
      "Defina a marca principal para aplicá-la automaticamente nas novas criações.",
      "Salve e selecione essa marca ao gerar um conteúdo.",
    ],
  },
  {
    id: "pdf-brand-kit",
    title: "Problemas ao enviar PDF do Brand Kit",
    category: "erros",
    summary:
      "Corrija falhas de formato, tamanho, leitura ou processamento do guia de marca.",
    route: "/brand-kit",
    keywords: ["pdf", "upload", "brand", "arquivo", "não envia", "processar"],
    steps: [
      "Confirme que o arquivo é realmente um PDF e não está protegido por senha.",
      "Reduza arquivos muito grandes e tente novamente com uma conexão estável.",
      "Prefira PDFs com texto selecionável; páginas somente em imagem podem ter leitura limitada.",
      "Se o envio terminar, mas a leitura falhar, cadastre manualmente as informações principais da marca.",
    ],
  },
  {
    id: "projetos-biblioteca",
    title: "Projetos e Biblioteca",
    category: "marca",
    summary: "Localize criações, imagens enviadas e referências salvas.",
    route: "/projetos",
    keywords: [
      "projeto",
      "biblioteca",
      "salvar",
      "sumiu",
      "imagem",
      "arquivo",
      "sincronização",
    ],
    steps: [
      "Use Meus projetos para continuar artes e carrosséis já criados.",
      "Use Biblioteca para encontrar uploads, referências e imagens geradas.",
      "Espere a sincronização inicial terminar antes de fechar a página.",
      "Se um item não aparecer, recarregue a tela e confirme que entrou com a mesma chave de acesso.",
    ],
  },
  {
    id: "publicacoes-fluxo",
    title: "Gerenciar Publicações",
    category: "planejamento",
    summary:
      "Organize o fluxo entre rascunho, revisão, aprovação, agendamento e publicação.",
    route: "/publicacoes",
    keywords: [
      "publicação",
      "rascunho",
      "revisão",
      "aprovação",
      "status",
      "conteúdo",
    ],
    steps: [
      "Crie ou abra um conteúdo em Publicações.",
      "Selecione a marca e as contas sociais corretas.",
      "Passe o conteúdo por revisão e aprovação antes de agendar.",
      "Use comentários internos para registrar ajustes da equipe.",
      "Publique agora ou envie o item aprovado para o calendário.",
    ],
  },
  {
    id: "agenda",
    title: "Agendar um conteúdo",
    category: "planejamento",
    summary:
      "Escolha data, hora, plataforma e conteúdo no calendário editorial.",
    route: "/agenda",
    keywords: ["agenda", "calendário", "agendar", "horário", "data", "post"],
    steps: [
      "Abra Calendário e escolha o dia desejado.",
      "Selecione o conteúdo, a plataforma, a conta e o horário.",
      "Confirme se o fuso e a data exibidos estão corretos.",
      "Salve e acompanhe o status na agenda e em Publicações.",
    ],
  },
  {
    id: "automacoes",
    title: "Criar e executar Automações",
    category: "planejamento",
    summary: "Automatize publicações aprovadas, respostas e ações recorrentes.",
    route: "/automacoes",
    keywords: ["automação", "regra", "executar", "cron", "automático"],
    steps: [
      "Abra Automações e crie uma regra com nome e condição claros.",
      "Revise a ação que será executada antes de ativar a regra.",
      "No plano Hobby da Vercel, a verificação automática ocorre uma vez por dia; use Executar agora quando precisar.",
      "Em configuração Pro, o cron pode verificar regras e posts a cada 15 minutos.",
    ],
  },
  {
    id: "conectar-redes",
    title: "Conectar uma rede social",
    category: "redes-sociais",
    summary: "Vincule contas e valide permissões antes de publicar.",
    route: "/redes",
    keywords: [
      "conectar",
      "rede",
      "instagram",
      "facebook",
      "tiktok",
      "linkedin",
      "youtube",
      "pinterest",
      "threads",
      "x",
    ],
    steps: [
      "Abra Redes conectadas e escolha a plataforma.",
      "Faça a autenticação oficial ou informe o token solicitado pela integração.",
      "Associe a conta à marca correta e execute o teste de conexão.",
      "Somente Instagram profissional e Páginas do Facebook têm publicação e resposta diretas completas nesta versão.",
      "Nas demais redes, use o fluxo de aprovação e faça a etapa final manualmente até a API oficial ser liberada.",
    ],
    important:
      "Nunca envie senhas, chaves de acesso ou tokens no chat de suporte.",
  },
  {
    id: "meta-instagram-facebook",
    title: "Instagram ou Facebook não conecta",
    category: "erros",
    summary:
      "Verifique o tipo da conta, vínculo com a Página, token e permissões da Meta.",
    route: "/redes",
    keywords: [
      "meta",
      "instagram",
      "facebook",
      "oauth",
      "token",
      "permissão",
      "webhook",
      "não conecta",
    ],
    steps: [
      "Confirme que o Instagram é profissional e está vinculado a uma Página do Facebook.",
      "Entre com um usuário da Meta que tenha acesso administrativo aos ativos.",
      "Refaça a conexão para renovar um token expirado ou revogado.",
      "Execute Testar conexão e leia a mensagem retornada pela API.",
      "Se o erro citar permissão, libere a permissão correspondente no aplicativo da Meta antes de tentar novamente.",
    ],
  },
  {
    id: "publicacao-falhou",
    title: "Uma publicação falhou",
    category: "erros",
    summary:
      "Diagnóstico para token, mídia, permissão, conta e disponibilidade da plataforma.",
    route: "/publicacoes",
    keywords: [
      "publicar",
      "falhou",
      "erro publicação",
      "não publicou",
      "mídia",
      "token expirado",
    ],
    steps: [
      "Abra o item e confira qual conta e plataforma foram selecionadas.",
      "Em Redes conectadas, execute o teste dessa conta.",
      "Reconecte a conta se o token estiver expirado, revogado ou sem permissão.",
      "Confirme que o arquivo atende ao formato e ao tamanho aceitos pela plataforma.",
      "Tente novamente; se o conector ainda não oferece envio direto, conclua a publicação manualmente.",
    ],
  },
  {
    id: "caixa-entrada",
    title: "Usar a Caixa de entrada",
    category: "redes-sociais",
    summary:
      "Leia e responda mensagens, comentários, menções e notas internas.",
    route: "/caixa-entrada",
    keywords: [
      "caixa de entrada",
      "mensagem",
      "comentário",
      "menção",
      "responder",
      "inbox",
    ],
    steps: [
      "Abra Caixa de entrada e selecione uma conversa.",
      "Use os filtros para encontrar mensagens abertas, pendentes ou resolvidas.",
      "Escreva a resposta e confirme a conta de envio.",
      "Quando a rede não permitir resposta direta, copie o texto e responda na própria plataforma.",
    ],
  },
  {
    id: "analytics",
    title: "Analytics e recomendações",
    category: "redes-sociais",
    summary:
      "Sincronize métricas e gere uma leitura estratégica do desempenho.",
    route: "/analytics",
    keywords: [
      "analytics",
      "métricas",
      "alcance",
      "engajamento",
      "insight",
      "relatório",
    ],
    steps: [
      "Conecte e teste as contas antes de abrir Analytics.",
      "Use a sincronização para buscar os dados disponíveis nas plataformas.",
      "Selecione o período e compare alcance, engajamento e evolução.",
      "Gere a recomendação estratégica com IA para receber próximos passos.",
    ],
  },
  {
    id: "equipe",
    title: "Gerenciar a Equipe",
    category: "conta-planos",
    summary: "Crie acessos individuais e defina a função de cada colaborador.",
    route: "/equipe",
    keywords: [
      "equipe",
      "membro",
      "colaborador",
      "permissão",
      "função",
      "acesso",
    ],
    steps: [
      "Abra Equipe e crie um membro com nome e função adequados.",
      "Envie a chave individual somente para a pessoa autorizada.",
      "Altere a função quando as responsabilidades mudarem.",
      "Desative ou exclua o acesso quando o colaborador sair da equipe.",
    ],
  },
  {
    id: "configuracoes",
    title: "Configurações da conta",
    category: "conta-planos",
    summary: "Altere nome, tema, notificações e sessão do dispositivo.",
    route: "/configuracoes",
    keywords: [
      "configuração",
      "perfil",
      "nome",
      "tema",
      "claro",
      "escuro",
      "notificação",
      "sair",
    ],
    steps: [
      "Use Perfil para alterar o nome exibido.",
      "Use Preferências para escolher tema claro, escuro ou do sistema.",
      "Use Notificações para liberar os avisos do navegador.",
      "Use Segurança para consultar a chave mascarada ou encerrar a sessão.",
    ],
  },
  {
    id: "plano-bloqueado",
    title: "Recurso bloqueado pelo plano",
    category: "conta-planos",
    summary: "Entenda por que algumas áreas aparecem com cadeado.",
    route: "/",
    keywords: [
      "plano",
      "bloqueado",
      "cadeado",
      "não disponível",
      "upgrade",
      "recurso",
    ],
    steps: [
      "Confira o nome do plano atual no Dashboard.",
      "Itens com cadeado não estão incluídos nesse plano ou nessa função da equipe.",
      "Peça ao administrador da conta para alterar o plano ou a sua permissão.",
      "Saia e entre novamente depois da alteração para atualizar o acesso.",
    ],
  },
  {
    id: "creditos",
    title: "Créditos acabaram ou não atualizaram",
    category: "conta-planos",
    summary: "Entenda consumo, renovação mensal e atualização do saldo.",
    route: "/",
    keywords: [
      "crédito",
      "limite",
      "acabou",
      "saldo",
      "renovar",
      "consumo",
      "zero",
    ],
    steps: [
      "Confira no Dashboard o total usado e a data de renovação.",
      "Criações com IA consomem créditos; o chat de suporte não consome.",
      "Recarregue a página se uma geração cancelada ainda aparecer no saldo.",
      "Se o saldo continuar incorreto, informe ao administrador o horário e o tipo da geração, sem enviar sua chave completa.",
    ],
  },
  {
    id: "chave-acesso",
    title: "Chave inválida, desativada ou acesso recusado",
    category: "erros",
    summary: "Corrija problemas ao entrar com uma chave de acesso.",
    route: "/acesso",
    keywords: [
      "chave",
      "login",
      "acesso",
      "inválida",
      "desativada",
      "entrar",
      "código",
    ],
    steps: [
      "Copie novamente a chave completa, sem espaços antes ou depois.",
      "Confirme que não trocou letras e números parecidos.",
      "Se a chave foi desativada ou excluída, peça uma nova ao administrador.",
      "Se acabou de receber uma chave, recarregue a página e tente novamente.",
    ],
    important:
      "Não compartilhe a chave completa em mensagens ou capturas de tela.",
  },
  {
    id: "carregamento-infinito",
    title: "Tela preta ou carregamento infinito",
    category: "erros",
    summary: "Recupere a interface quando uma página não termina de abrir.",
    route: "/",
    keywords: [
      "tela preta",
      "carregando",
      "travado",
      "infinito",
      "não abre",
      "branco",
      "spinner",
    ],
    steps: [
      "Aguarde alguns segundos e faça uma atualização forçada da página com Ctrl + F5.",
      "Abra o sistema em uma janela anônima para testar cache e extensões.",
      "Confirme que a internet está funcionando e que cookies e armazenamento local não estão bloqueados.",
      "Saia e entre novamente com a mesma chave.",
      "Se persistir, informe a página, o horário, o navegador e a mensagem exibida.",
    ],
  },
  {
    id: "versao-deploy-cache",
    title: "Erro depois de uma atualização do sistema",
    category: "erros",
    summary: "Resolva arquivos antigos do navegador após um novo deploy.",
    route: "/",
    keywords: [
      "atualização",
      "deploy",
      "chunk",
      "failed to fetch",
      "recarregar",
      "versão nova",
    ],
    steps: [
      "Clique em Recarregar agora quando a tela informar que existe uma versão mais nova.",
      "Se a mensagem continuar, use Ctrl + F5 para ignorar o cache.",
      "Feche abas antigas da Zunexi.ai e abra o endereço novamente.",
      "Em último caso, limpe somente os dados do site da Zunexi.ai no navegador e entre de novo.",
    ],
  },
  {
    id: "groq-erros",
    title: "Erro da Groq ao gerar texto",
    category: "erros",
    summary:
      "Soluções para limite, pedido grande, modelo indisponível e falha temporária.",
    route: "/carrossel",
    keywords: [
      "groq",
      "413",
      "429",
      "401",
      "403",
      "modelo",
      "pedido grande",
      "texto",
      "indisponível",
      "api",
    ],
    steps: [
      "Erro 413 ou pedido grande: reduza o briefing, remova repetições e tente com menos slides.",
      "Erro 429 ou limite atingido: aguarde alguns instantes e tente novamente.",
      "Modelo indisponível: o administrador deve revisar GROQ_TEXT_MODEL na Vercel.",
      "Chave inválida ou sem permissão: o administrador deve revisar GROQ_API_KEY na Vercel, sem expor a chave ao cliente.",
      "Erro 5xx: é uma indisponibilidade temporária do provedor; tente novamente mais tarde.",
    ],
    important:
      "O suporte possui respostas locais e continua orientando mesmo quando a Groq está indisponível.",
  },
  {
    id: "imagem-nao-gerada",
    title: "Imagem não foi gerada",
    category: "erros",
    summary:
      "Diagnóstico para provedor, limite, segurança, rede e tempo de resposta.",
    route: "/carrossel",
    keywords: [
      "imagem",
      "não gerou",
      "falhou",
      "provider",
      "provedor",
      "timeout",
      "404",
      "429",
    ],
    steps: [
      "Use Testar provedores, quando disponível, para identificar qual conexão falhou.",
      "Tente novamente com uma descrição visual mais direta e sem instruções contraditórias.",
      "Erro 429 indica limite do provedor; aguarde antes de repetir.",
      "Erro 401 ou 403 exige que o administrador revise a chave e as permissões do provedor.",
      "Erro 404 geralmente indica modelo ou rota inválida e precisa de correção na configuração do servidor.",
      "Em timeout, aguarde e gere apenas a imagem necessária em vez de repetir o carrossel inteiro.",
    ],
  },
  {
    id: "imagem-qualidade",
    title: "Imagem repetida, simples ou fora do tema",
    category: "erros",
    summary: "Melhore a variedade e a fidelidade visual das imagens geradas.",
    route: "/carrossel",
    keywords: [
      "imagem repetida",
      "mesma imagem",
      "feia",
      "simples",
      "fora do tema",
      "qualidade",
      "layout",
    ],
    steps: [
      "Descreva o assunto principal, ambiente, enquadramento, iluminação e estilo desejados.",
      "Informe diferenças visuais claras entre os slides, em vez de pedir apenas variações.",
      "Selecione a marca correta para usar a direção visual do Brand Kit.",
      "Gere novamente somente a imagem ruim e mantenha as imagens aprovadas.",
      "Use uma imagem de referência na Biblioteca quando quiser maior consistência.",
    ],
  },
  {
    id: "texto-na-imagem",
    title: "A imagem gerada veio com texto errado",
    category: "erros",
    summary: "Separe a imagem de fundo dos textos editáveis da composição.",
    route: "/editor",
    keywords: [
      "texto errado",
      "letras",
      "imagem com texto",
      "logo errada",
      "ortografia",
      "palavra",
    ],
    steps: [
      "Gere o fundo sem pedir ao modelo para desenhar títulos, preços, telefone ou logotipo.",
      "Adicione o texto correto como elemento editável no editor.",
      "Apague ou recorte a região do fundo que contém letras deformadas.",
      "Gere novamente somente o fundo e preserve o restante da composição.",
    ],
    important:
      "Modelos de imagem podem errar palavras. Textos importantes devem ser elementos editáveis, não parte da fotografia gerada.",
  },
  {
    id: "imagem-nao-aplicada",
    title: "A imagem foi criada, mas não apareceu na arte",
    category: "erros",
    summary: "Recupere uma geração concluída que não foi aplicada ao slide.",
    route: "/biblioteca",
    keywords: [
      "imagem não apareceu",
      "não usou",
      "gerou atoa",
      "biblioteca",
      "aplicar",
      "slide",
    ],
    steps: [
      "Abra a Biblioteca e confirme se a imagem gerada foi salva.",
      "Volte ao editor, selecione o slide correto e aplique a imagem da Biblioteca.",
      "Espere a geração terminar antes de trocar de página ou fechar a aba.",
      "Se o trabalho estiver em andamento, não inicie outra geração para o mesmo slide.",
    ],
  },
  {
    id: "sobreposicao-layout",
    title: "Textos sobrepostos ou fora da área",
    category: "erros",
    summary: "Corrija composição, tamanho de fonte e área segura no editor.",
    route: "/projetos",
    keywords: [
      "sobreposição",
      "fora da área",
      "cortado",
      "texto em cima",
      "layout",
      "editor",
    ],
    steps: [
      "Abra a arte no editor e selecione o elemento que está fora da área.",
      "Reduza a fonte ou o comprimento do texto antes de diminuir margens.",
      "Mantenha títulos, textos e CTA dentro da área segura da composição.",
      "Revise todos os slides individualmente antes de exportar.",
    ],
  },
  {
    id: "supabase-erros",
    title: "Erro de banco de dados ou Supabase",
    category: "erros",
    summary:
      "Identifique configuração ausente, migração pendente, permissão ou conexão.",
    route: "/",
    keywords: [
      "supabase",
      "banco",
      "database",
      "rls",
      "permissão",
      "migration",
      "migração",
      "401",
      "409",
      "500",
    ],
    steps: [
      "Se a mensagem pedir uma migração, o administrador deve executar o arquivo SQL indicado no projeto Supabase correto.",
      "Erro 401 indica chave ausente ou incorreta; revise as variáveis do servidor.",
      "Erro 409 indica conflito ou registro duplicado; não repita a criação e verifique o item existente.",
      "Erro de RLS ou permissão exige revisar as políticas da tabela para a empresa e o usuário corretos.",
      "Depois de alterar variáveis na Vercel, faça um novo deploy para a configuração entrar em vigor.",
    ],
    important:
      "Somente o administrador deve manipular chaves privadas, SQL e políticas do banco.",
  },
  {
    id: "rede-navegador",
    title: "Falha de internet, timeout ou navegador",
    category: "erros",
    summary:
      "Diferencie erro local de indisponibilidade temporária do serviço.",
    route: "/",
    keywords: [
      "internet",
      "rede",
      "timeout",
      "fetch",
      "offline",
      "navegador",
      "conexão",
    ],
    steps: [
      "Confirme se outros sites abrem normalmente no mesmo dispositivo.",
      "Recarregue a página e tente a ação uma única vez.",
      "Teste em janela anônima para descartar extensão ou cache.",
      "Desative temporariamente bloqueadores somente para o domínio da Zunexi.ai.",
      "Se vários usuários estiverem com a mesma falha, aguarde a recuperação do serviço e informe o horário ao administrador.",
    ],
  },
  {
    id: "notificacoes-bloqueadas",
    title: "Notificações não aparecem",
    category: "erros",
    summary: "Libere a permissão do navegador e as preferências da conta.",
    route: "/configuracoes",
    keywords: ["notificação", "aviso", "bloqueada", "permissão", "navegador"],
    steps: [
      "Abra Configurações, entre em Notificações e ative os avisos.",
      "Libere a permissão no cadeado ao lado do endereço do site.",
      "Confirme que o sistema operacional não está no modo Não perturbe.",
      "Recarregue a página depois de alterar a permissão.",
    ],
  },
];

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreArticle(
  article: SupportArticle,
  query: string,
  currentPath?: string,
) {
  const normalizedQuery = normalizeSearch(query);
  const words = normalizedQuery.split(" ").filter((word) => word.length > 2);
  const title = normalizeSearch(article.title);
  const summary = normalizeSearch(article.summary);
  const keywords = article.keywords.map(normalizeSearch);
  let score = article.route && currentPath?.startsWith(article.route) ? 4 : 0;

  if (normalizedQuery && title.includes(normalizedQuery)) score += 18;
  for (const word of words) {
    if (title.includes(word)) score += 5;
    if (summary.includes(word)) score += 2;
    if (
      keywords.some(
        (keyword) => keyword.includes(word) || word.includes(keyword),
      )
    )
      score += 4;
    if (article.steps.some((step) => normalizeSearch(step).includes(word)))
      score += 1;
  }
  return score;
}

export function searchSupportArticles(
  query: string,
  currentPath?: string,
  limit = 6,
) {
  const normalized = normalizeSearch(query);
  if (!normalized) return SUPPORT_ARTICLES.slice(0, limit);
  return SUPPORT_ARTICLES.map((article) => ({
    article,
    score: scoreArticle(article, normalized, currentPath),
  }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.article);
}

export function articleAsContext(article: SupportArticle) {
  return [
    `ARTIGO: ${article.title}`,
    `RESUMO: ${article.summary}`,
    article.route ? `PÁGINA: ${article.route}` : "",
    "PASSOS:",
    ...article.steps.map((step, index) => `${index + 1}. ${step}`),
    article.important ? `IMPORTANTE: ${article.important}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildKnowledgeFallback(question: string, currentPath?: string) {
  const matches = searchSupportArticles(question, currentPath, 3);
  if (!matches.length) {
    return {
      answer:
        "Não encontrei uma solução exata para esse caso. Tente recarregar a página com Ctrl + F5, confirme sua conexão e envie a mensagem de erro completa, junto com o nome da página e o que você estava fazendo. Não envie senhas, chaves ou tokens.",
      articleIds: [] as string[],
      needsHuman: true,
    };
  }

  const primary = matches[0];
  const answer = [
    `A solução mais provável está em **${primary.title}**:`,
    ...primary.steps.map((step, index) => `${index + 1}. ${step}`),
    primary.important ? `\nImportante: ${primary.important}` : "",
    matches.length > 1
      ? `\nTambém pode ajudar: ${matches
          .slice(1)
          .map((item) => item.title)
          .join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    answer,
    articleIds: matches.map((article) => article.id),
    needsHuman: false,
  };
}
