export type ThemePreference = "claro" | "escuro" | "sistema";
export type ResolvedTheme = "claro" | "escuro";

export const THEME_KEY = "zunexi.theme";
const LEGACY_THEME_KEY = "inlabs.theme";
export const THEME_CHANGED_EVENT = "zunexi:theme-changed";

function normalizeTheme(value: string | null): ThemePreference | null {
  if (value === "claro" || value === "escuro" || value === "sistema") return value;
  if (value === "light") return "claro";
  if (value === "dark") return "escuro";
  if (value === "system") return "sistema";
  return null;
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "escuro";

  const current = normalizeTheme(localStorage.getItem(THEME_KEY));
  if (current) return current;

  const legacy = normalizeTheme(localStorage.getItem(LEGACY_THEME_KEY));
  if (legacy) {
    localStorage.setItem(THEME_KEY, legacy);
    localStorage.removeItem(LEGACY_THEME_KEY);
    return legacy;
  }

  return "escuro";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "sistema") return preference;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "escuro";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

export function applyTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document === "undefined") return resolved;

  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "escuro");
  root.classList.toggle("light", resolved === "claro");
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved === "escuro" ? "dark" : "light";
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  if (typeof window !== "undefined") {
    localStorage.setItem(THEME_KEY, preference);
    localStorage.removeItem(LEGACY_THEME_KEY);
  }

  const resolved = applyTheme(preference);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { preference, resolved } }));
  }
  return resolved;
}

export function subscribeTheme(callback: (preference: ThemePreference, resolved: ResolvedTheme) => void) {
  if (typeof window === "undefined") return () => undefined;

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    const preference = getThemePreference();
    const resolved = applyTheme(preference);
    callback(preference, resolved);
  };

  const onThemeChanged = () => sync();
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === THEME_KEY || event.key === LEGACY_THEME_KEY) sync();
  };
  const onSystemThemeChanged = () => {
    if (getThemePreference() === "sistema") sync();
  };

  sync();
  window.addEventListener(THEME_CHANGED_EVENT, onThemeChanged);
  window.addEventListener("storage", onStorage);
  media.addEventListener?.("change", onSystemThemeChanged);

  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, onThemeChanged);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener?.("change", onSystemThemeChanged);
  };
}
