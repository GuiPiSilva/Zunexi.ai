[README.md](https://github.com/user-attachments/files/30344003/README.md)
#Bem Vindo ao Meu Projeto - INLAbs.Ia

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS


## Configuração da Kie.ai (imagens)

Adicione estas variáveis no ambiente do servidor/deploy:

```env
KIE_API_KEY="sua-chave-da-kie"
KIE_IMAGE_MODEL="google/nano-banana"
KIE_IMAGE_TIMEOUT_MS="180000"
```

A chave nunca deve usar o prefixo `VITE_`, porque isso a exporia no navegador. O backend cria uma tarefa na Kie.ai, consulta o resultado e devolve a imagem ao editor do sistema.
