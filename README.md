# Zunexi.ai

Aplicação de criação de carrosséis e cartazes para Instagram com IA.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Variáveis de ambiente

Configure as chaves privadas no ambiente do servidor (por exemplo, no Vercel), nunca no repositório público.

### NVIDIA Build API — geração de imagens

Crie uma chave em `https://build.nvidia.com/settings/api-keys` e configure no Vercel:

```env
NVIDIA_API_KEY=nvapi-...
NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-schnell
NVIDIA_IMAGE_API_URL=https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell
NVIDIA_IMAGE_TIMEOUT_MS=120000
```

A chamada é feita somente no backend do TanStack Start/Vercel. A `NVIDIA_API_KEY` não deve usar prefixo `VITE_` e não deve ser enviada ao navegador.

Não é necessário Lightning AI nem servidor GPU próprio.

As variáveis do Supabase e Groq devem continuar configuradas conforme o ambiente atual do projeto.

## Motor criativo Zunexi

O fluxo de carrossel e cartaz agora usa uma arquitetura em etapas:

1. planejamento da campanha e da narrativa;
2. direção visual específica por slide;
3. memória das criações recentes do usuário para evitar repetição;
4. política sem pessoas por padrão, liberada apenas quando o briefing pede pessoas explicitamente;
5. geração somente do fundo visual, sem texto;
6. aplicação de texto e marca por coordenadas controladas;
7. revisão criativa pela Groq e revisão geométrica local antes de salvar.

Variáveis opcionais:

- `GROQ_CREATIVE_REVIEW_ENABLED=false` desativa a segunda revisão por IA.
- `GROQ_REVIEW_MODEL` escolhe um modelo separado para a revisão. Quando ausente, usa `GROQ_TEXT_MODEL`.

Nenhuma migração nova do Supabase é necessária. A memória criativa utiliza as gerações já salvas na tabela `generations`.
