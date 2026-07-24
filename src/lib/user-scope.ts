const ACCESS_KEY_STORAGE = "inlabs.accessKey";

function hashValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getCurrentUserScope(): string {
  if (typeof window === "undefined") return "server";
  const key = localStorage.getItem(ACCESS_KEY_STORAGE)?.trim().toUpperCase();
  return key ? hashValue(key) : "anonymous";
}

export function getUserStorageKey(base: string, ownerScope = getCurrentUserScope()): string {
  return `${base}.${ownerScope}`;
}

export function migrateLegacyStorage(base: string, ownerScope = getCurrentUserScope()): string {
  const scoped = getUserStorageKey(base, ownerScope);
  if (typeof window === "undefined") return scoped;
  if (ownerScope === getCurrentUserScope() && localStorage.getItem(scoped) === null) {
    const legacy = localStorage.getItem(base);
    if (legacy !== null) {
      localStorage.setItem(scoped, legacy);
      localStorage.removeItem(base);
    }
  }
  return scoped;
}
