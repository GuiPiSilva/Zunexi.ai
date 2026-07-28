import { getUserStorageKey } from "@/lib/user-scope";

export type InLabsNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  href?: string;
  kind?: "success" | "error" | "info";
};

const BASE_KEY = "inlabs.notifications";
const EVENT_NAME = "inlabs:notifications-changed";

function key(ownerScope?: string) {
  return getUserStorageKey(BASE_KEY, ownerScope);
}

export function loadNotifications(ownerScope?: string): InLabsNotification[] {
  if (typeof window === "undefined") return [];
  try {
    return (JSON.parse(localStorage.getItem(key(ownerScope)) || "[]") as InLabsNotification[]).slice(0, 50);
  } catch {
    return [];
  }
}

function saveNotifications(items: InLabsNotification[], ownerScope?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(ownerScope), JSON.stringify(items.slice(0, 50)));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function addNotification(input: Omit<InLabsNotification, "id" | "createdAt" | "read">, ownerScope?: string) {
  const item: InLabsNotification = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    read: false,
  };
  saveNotifications([item, ...loadNotifications(ownerScope)], ownerScope);

  const browserNotificationsEnabled = typeof window === "undefined" || localStorage.getItem("zunexi.notifications.enabled") !== "false";
  if (browserNotificationsEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
    const notification = new Notification(input.title, {
      body: input.message,
      icon: "/favicon.png",
      tag: item.id,
    });
    if (input.href) notification.onclick = () => window.open(input.href, "_self");
  }
  return item;
}

export function markAllNotificationsRead() {
  saveNotifications(loadNotifications().map((item) => ({ ...item, read: true })));
}

export function clearNotifications() {
  saveNotifications([]);
}

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported" as const;
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function subscribeNotifications(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", listener);
  };
}
