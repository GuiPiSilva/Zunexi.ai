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

Principais variáveis usadas pelo projeto:

```env
HF_TOKEN=hf_...
HUGGINGFACE_IMAGE_MODEL=Qwen/Qwen-Image
# Compatibilidade: HF_IMAGE_MODEL também é aceito, mas prefira HUGGINGFACE_IMAGE_MODEL.
```

As variáveis do Supabase e Groq devem continuar configuradas conforme o ambiente atual do projeto.
