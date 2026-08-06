# Zunexi.ai

Plataforma multi-tenant para criação e gerenciamento de redes sociais com inteligência artificial.

## O que esta versão possui

- Criação de carrosséis e cartazes com IA.
- Brand Kit separado por marca, incluindo leitura de PDF.
- Fluxo editorial: rascunho, revisão, alterações, aprovação, agendamento e publicação.
- Contas sociais separadas por empresa e marca.
- Publicação direta para Instagram profissional e Páginas do Facebook pela API oficial da Meta.
- Conectores e validação de conta para Threads, TikTok, LinkedIn, YouTube, Pinterest, X e Google Perfil da Empresa.
- Caixa de entrada para mensagens, comentários, menções e notas internas.
- Webhook da Meta com validação de assinatura.
- Analytics, sincronização de contas e consultor estratégico pela Groq.
- Social listening no plano Agência.
- Equipe com funções e chaves de acesso individuais.
- Automações e publicação programada pela Vercel Cron.
- Biblioteca, projetos, agenda e painel administrativo existentes.

## Instalação

```bash
npm install
npm run dev
```

Para validar a versão de produção:

```bash
npm run build
```

## Banco de dados

Depois das migrações anteriores, execute no SQL Editor do Supabase:

```text
supabase/migrations/7-EXECUTAR-GESTAO-REDES-SOCIAIS.sql
```

Essa migração cria as tabelas de contas sociais, conteúdos, comentários internos, caixa de entrada, mensagens, métricas, menções, automações e histórico de execução. Todas são protegidas por empresa e marca.

## Variáveis de ambiente

Copie `.env.example` e configure as variáveis no Vercel. As chaves privadas nunca devem receber o prefixo `VITE_`.

Variáveis obrigatórias para a aplicação:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SOCIAL_TOKEN_SECRET=
CRON_SECRET=
```

Para login administrativo:

```env
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
```

Para textos, análise e criação com Groq:

```env
GROQ_API_KEY=
GROQ_TEXT_MODEL=llama-3.3-70b-versatile
```

Para Instagram e Facebook:

```env
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_GRAPH_VERSION=v26.0
```

Use no painel da Meta:

```text
URL do webhook: https://SEU-DOMINIO.vercel.app/api/social/meta-webhook
Token de verificação: o mesmo valor de META_WEBHOOK_VERIFY_TOKEN
```

O token de cada Página/conta profissional é cadastrado dentro de **Redes conectadas**. Ele é criptografado no servidor com AES-256-GCM antes de ser salvo.

## Agendamento automático

O `vercel.json` incluído é compatível com o plano Hobby da Vercel e executa a verificação uma vez por dia, às 12:00 UTC:

```text
/api/social/publish-due
```

Para uma conta Vercel Pro, substitua o conteúdo de `vercel.json` pelo exemplo `vercel.pro.json.example`, que verifica publicações e automações a cada 15 minutos. No plano Hobby, o botão **Executar agora** na página de Automações permite processar as regras manualmente a qualquer momento.

A rota exige `CRON_SECRET`. Na Vercel, a chamada de cron envia automaticamente o cabeçalho de autorização quando essa variável está configurada para o projeto.

## Limites dos conectores

Instagram e Facebook possuem publicação e respostas diretas implementadas. As demais redes podem ser conectadas, testadas, selecionadas no calendário e usadas no fluxo de aprovação; a publicação direta de cada uma deve ser liberada com as permissões e o aplicativo oficial correspondente. O sistema não simula sucesso: quando um conector não está habilitado para envio, ele informa que a publicação deve ser feita manualmente.
