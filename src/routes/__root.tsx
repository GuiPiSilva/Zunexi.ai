import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { subscribeTheme, type ThemePreference } from "../lib/theme";

const THEME_INIT_SCRIPT = `(() => {
  try {
    const key = "zunexi.theme";
    const legacyKey = "inlabs.theme";
    const stored = localStorage.getItem(key) || localStorage.getItem(legacyKey) || "escuro";
    const preference = stored === "claro" || stored === "light" ? "claro" : stored === "sistema" || stored === "system" ? "sistema" : "escuro";
    const resolved = preference === "sistema"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro")
      : preference;
    const root = document.documentElement;
    root.classList.add(resolved === "claro" ? "light" : "dark");
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved === "claro" ? "light" : "dark";
  } catch {}
})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient-brand font-display">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">Essa rota não existe no Zunexi.ai.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center rounded-md gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground">
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function isDynamicImportError(error: Error) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk .* failed/i.test(
    error.message,
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const chunkLoadError = isDynamicImportError(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{chunkLoadError ? "Atualizando a Zunexi.ai" : "Algo quebrou"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {chunkLoadError
            ? "Uma versão mais nova do sistema foi publicada. Recarregue para usar os arquivos do deploy atual."
            : error.message}
        </p>
        <button
          onClick={() => {
            if (chunkLoadError) {
              window.location.reload();
              return;
            }
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground"
        >{chunkLoadError ? "Recarregar agora" : "Tentar novamente"}</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Zunexi.ai— Estúdio criativo de conteúdo para Instagram" },
      { name: "description", content: "Crie carrosséis e cartazes para Instagram com editor visual e IA, com layouts sempre diferentes." },
      { property: "og:title", content: "Zunexi.ai" },
      { property: "og:description", content: "Editor visual + IA para conteúdo de Instagram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><HeadContent /><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [theme, setTheme] = useState<ThemePreference>("escuro");

  useEffect(() => subscribeTheme((preference) => setTheme(preference)), []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme={theme === "claro" ? "light" : theme === "escuro" ? "dark" : "system"} position="top-right" />
    </QueryClientProvider>
  );
}
