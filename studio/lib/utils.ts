import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChatId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export function createNewChatHref(prompt?: string) {
  const base = `/chat/${createChatId()}`;
  const normalizedPrompt = (prompt || "").trim();
  if (!normalizedPrompt) {
    return base;
  }
  return `${base}?prompt=${encodeURIComponent(normalizedPrompt)}`;
}
