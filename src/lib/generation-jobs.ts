import { getCurrentUserScope, getUserStorageKey } from "@/lib/user-scope";

export type CreationJobType = "carrossel" | "cartaz";
export type CreationJobStatus = "queued" | "running" | "review" | "completed" | "failed";

export type CreationJob = {
  id: string;
  ownerScope: string;
  type: CreationJobType;
  status: CreationJobStatus;
  progress: number;
  payload: Record<string, unknown>;
  result?: unknown;
  assets: Record<string, { url: string }>;
  projectId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const BASE_KEY = "inlabs.creationJobs";
const EVENT_NAME = "inlabs:jobs-changed";
const runningJobs = new Set<string>();

function storageKey(ownerScope = getCurrentUserScope()) {
  return getUserStorageKey(BASE_KEY, ownerScope);
}

export function loadCreationJobs(ownerScope = getCurrentUserScope()): CreationJob[] {
  if (typeof window === "undefined") return [];
  try {
    return (JSON.parse(localStorage.getItem(storageKey(ownerScope)) || "[]") as CreationJob[])
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveCreationJobs(jobs: CreationJob[], ownerScope = getCurrentUserScope()) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(ownerScope), JSON.stringify(jobs.slice(0, 20)));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function createCreationJob(type: CreationJobType, payload: Record<string, unknown>): CreationJob {
  const ownerScope = getCurrentUserScope();
  const job: CreationJob = {
    id: crypto.randomUUID(),
    ownerScope,
    type,
    status: "queued",
    progress: 2,
    payload,
    assets: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveCreationJobs([job, ...loadCreationJobs(ownerScope)], ownerScope);
  return job;
}

export function updateCreationJob(id: string, patch: Partial<CreationJob>, ownerScope = getCurrentUserScope()): CreationJob | undefined {
  const jobs = loadCreationJobs(ownerScope);
  const index = jobs.findIndex((job) => job.id === id);
  if (index < 0) return undefined;
  const next = { ...jobs[index], ...patch, updatedAt: Date.now() };
  jobs[index] = next;
  saveCreationJobs(jobs, ownerScope);
  return next;
}

export function getCreationJob(id: string, ownerScope = getCurrentUserScope()) {
  return loadCreationJobs(ownerScope).find((job) => job.id === id);
}

export function getLatestCreationJob(type: CreationJobType) {
  return loadCreationJobs().find((job) => job.type === type);
}

export function getActiveCreationJob(type: CreationJobType) {
  return loadCreationJobs().find((job) => job.type === type && (job.status === "queued" || job.status === "running"));
}

export function getPendingCreationJob(type: CreationJobType) {
  return loadCreationJobs().find((job) =>
    job.type === type && (job.status === "queued" || job.status === "running" || job.status === "review"),
  );
}

export async function withCreationJobLock(id: string, task: () => Promise<void>): Promise<boolean> {
  if (runningJobs.has(id)) return false;
  runningJobs.add(id);
  try {
    await task();
    return true;
  } finally {
    runningJobs.delete(id);
  }
}

export function subscribeCreationJobs(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", listener);
  };
}
