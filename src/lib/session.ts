const KEY = "inlabs.accessKey";
const USER_NAME = "inlabs.userName";
const ADMIN = "inlabs.adminToken";

export function getAccessKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setAccessKey(key: string) {
  localStorage.setItem(KEY, key);
}

export function getAccessUserName(): string {
  if (typeof window === "undefined") return "Usuário InLabs";
  return localStorage.getItem(USER_NAME)?.trim() || "Usuário InLabs";
}

export function setAccessUserName(name: string) {
  const normalized = name.trim();
  if (normalized) localStorage.setItem(USER_NAME, normalized);
  else localStorage.removeItem(USER_NAME);
}

export function clearAccessKey() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(USER_NAME);
  localStorage.removeItem("inlabs.profileName");
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN);
}

export function setAdminToken(t: string) {
  localStorage.setItem(ADMIN, t);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN);
}

// Local shape check — server does the real validation.
export function validateKey(key: string): boolean {
  return key.trim().length >= 4;
}
