import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const PRELOAD_RECOVERY_KEY = "zunexi.preload-recovery";
const PRELOAD_RECOVERY_WINDOW_MS = 30_000;

// Vite can fail to load a lazy route after a new deployment when a browser tab
// still references a hashed chunk from the previous build. Recover once with a
// full reload so the document and all chunks come from the same deployment.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    let lastRecovery = 0;
    try {
      lastRecovery = Number(sessionStorage.getItem(PRELOAD_RECOVERY_KEY) || "0");
    } catch {
      // sessionStorage may be unavailable in restrictive browsing modes.
    }

    if (Date.now() - lastRecovery < PRELOAD_RECOVERY_WINDOW_MS) {
      // Do not hide a persistent failure. Let the router error boundary show it.
      return;
    }

    event.preventDefault();
    try {
      sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(Date.now()));
    } catch {
      // Reload still works even if storage is unavailable.
    }
    window.location.reload();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
