import { getUserStorageKey, migrateLegacyStorage } from "@/lib/user-scope";

export type ProjectType = "carrossel" | "cartaz";

export interface Slide {
  id: string;
  canvas: unknown;
  thumb?: string;
  width: number;
  height: number;
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: number;
  updatedAt: number;
  slides: Slide[];
  meta?: {
    theme?: string;
    style?: string;
    ratio?: string;
    reference?: string;
    creativePlan?: unknown;
    reviewSummary?: unknown;
  };
}

const K = "inlabs.projects";
const LK = "inlabs.library";
const FK = "inlabs.fonts";
const PROJECTS_EVENT = "inlabs:projects-changed";
const LIBRARY_EVENT = "inlabs:library-changed";

function scoped(base: string, ownerScope?: string) {
  return migrateLegacyStorage(base, ownerScope);
}

export function loadProjects(ownerScope?: string): Project[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(scoped(K, ownerScope)) || "[]") as Project[];
  } catch { return []; }
}

export function saveProjects(list: Project[], ownerScope?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getUserStorageKey(K, ownerScope), JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(PROJECTS_EVENT));
}

export function subscribeProjects(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PROJECTS_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(PROJECTS_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function getProject(id: string): Project | undefined {
  return loadProjects().find((project) => project.id === id);
}

export function upsertProject(project: Project, ownerScope?: string) {
  const all = loadProjects(ownerScope);
  const index = all.findIndex((item) => item.id === project.id);
  project.updatedAt = Date.now();
  if (index >= 0) all[index] = project;
  else all.unshift(project);
  saveProjects(all, ownerScope);
}

export function deleteProject(id: string) {
  saveProjects(loadProjects().filter((project) => project.id !== id));
}

export function duplicateProject(id: string): Project | undefined {
  const project = getProject(id);
  if (!project) return;
  const copy: Project = {
    ...project,
    id: crypto.randomUUID(),
    name: `${project.name} (cópia)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  upsertProject(copy);
  return copy;
}

export function newProject(type: ProjectType, name: string, meta: Project["meta"] = {}): Project {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    slides: [],
    meta,
  };
}

export interface LibItem { id: string; url: string; name: string; addedAt: number }
export function loadLibrary(): LibItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scoped(LK)) || "[]"); } catch { return []; }
}
export function addLibrary(item: LibItem) {
  const all = loadLibrary();
  all.unshift(item);
  localStorage.setItem(getUserStorageKey(LK), JSON.stringify(all.slice(0, 200)));
  window.dispatchEvent(new CustomEvent(LIBRARY_EVENT));
}
export function removeLibrary(id: string) {
  localStorage.setItem(getUserStorageKey(LK), JSON.stringify(loadLibrary().filter((item) => item.id !== id)));
  window.dispatchEvent(new CustomEvent(LIBRARY_EVENT));
}

export function subscribeLibrary(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(LIBRARY_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(LIBRARY_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function loadFavFonts(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scoped(FK)) || "[]"); } catch { return []; }
}
export function toggleFavFont(name: string) {
  const current = loadFavFonts();
  const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
  localStorage.setItem(getUserStorageKey(FK), JSON.stringify(next));
}
