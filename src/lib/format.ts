/**
 * Formatting helpers. Dates:
 *  - `date` columns (YYYY-MM-DD) are calendar dates with no timezone — they are
 *    parsed and formatted in UTC so they never shift by a day.
 *  - `timestamptz` values are shown in Israel time.
 */
const TZ = "Asia/Jerusalem";

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const int = new Intl.NumberFormat("he-IL");

export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return ils.format(Number.isFinite(n) ? n : 0);
}

export function formatNumber(value: number | null | undefined): string {
  return int.format(value ?? 0);
}

const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateShortFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", timeZone: "UTC" });
const tsFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const tsDayFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

function parseDateOnly(d: string): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00Z`);
}

/** For `date` columns. */
export function formatDate(d: string | null | undefined, opts?: { short?: boolean }): string {
  if (!d) return "";
  return (opts?.short ? dateShortFmt : dateFmt).format(parseDateOnly(d));
}

/** For `timestamptz` columns. */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return tsFmt.format(new Date(ts));
}

export function formatDay(ts: string | null | undefined): string {
  if (!ts) return "";
  return tsDayFmt.format(new Date(ts));
}

export function formatTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return timeFmt.format(new Date(ts));
}

/** Today's calendar date in Israel as YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Israel calendar date `days` from today, as YYYY-MM-DD. */
export function isoDateOffset(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + days * 86_400_000));
}

/** Whole days from today (Israel) to a date column. Negative = past. */
export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const diff = parseDateOnly(d).getTime() - parseDateOnly(todayISO()).getTime();
  return Math.round(diff / 86_400_000);
}

export function relativeDue(d: string | null | undefined): string {
  const n = daysUntil(d);
  if (n === null) return "";
  if (n === 0) return "היום";
  if (n === 1) return "מחר";
  if (n === -1) return "אתמול";
  if (n < 0) return `לפני ${-n} ימים`;
  if (n <= 14) return `בעוד ${n} ימים`;
  return formatDate(d, { short: true });
}

const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
export function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "";
  const s = (new Date(ts).getTime() - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return "עכשיו";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), "day");
  return formatDay(ts);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Israeli-style display: 050-123-4567. Leaves anything unusual untouched. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (/^05\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0[2-9]\d{7}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return phone;
}

export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = `972${d.slice(1)}`;
  if (d.length < 9) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function ensureUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function displayUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}
