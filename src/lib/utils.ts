import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Escapes a user search term for PostgREST `or()` / `ilike` filters. */
export function searchPattern(q: string): string {
  const clean = q.replace(/[,()*%\\:"]/g, " ").trim().slice(0, 80);
  return `%${clean}%`;
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export const PAGE_SIZE = 25;

export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  const p = Math.max(1, page);
  return [(p - 1) * size, p * size - 1];
}

export function parsePage(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
