import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatPhone, displayUrl, ensureUrl } from "@/lib/format";

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm text-ink-3">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14")}>
      <div className="grid size-11 place-items-center rounded-lg border border-line bg-sunken text-ink-3">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-[linear-gradient(90deg,var(--surface-sunken)_0%,#f7f8fa_50%,var(--surface-sunken)_100%)] bg-[length:200%_100%] animate-[shimmer_1.4s_linear_infinite]",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Stat card — a link to the filtered page behind the number.
// ---------------------------------------------------------------------------
export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "neutral" | "warn" | "danger";
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-3">{label}</span>
        {href && <ChevronLeft className="size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight num",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </>
  );
  const cls = "group block rounded-lg border border-line bg-surface p-4 shadow-1 transition-[border-color,box-shadow] duration-150";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-line-strong hover:shadow-2")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// LTR values inside RTL text
// ---------------------------------------------------------------------------
export function Ltr({ className, ...props }: ComponentProps<"bdi">) {
  return <bdi dir="ltr" className={cn("ltr", className)} {...props} />;
}

export function Money({ value, className }: { value: number | string | null | undefined; className?: string }) {
  return <Ltr className={cn("num", className)}>{formatMoney(value)}</Ltr>;
}

export function PhoneLink({ phone, className }: { phone: string | null | undefined; className?: string }) {
  if (!phone) return <span className="text-ink-3">—</span>;
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={cn("font-mono text-[0.92em] text-ink hover:text-accent", className)}>
      <Ltr>{formatPhone(phone)}</Ltr>
    </a>
  );
}

export function EmailLink({ email, className }: { email: string | null | undefined; className?: string }) {
  if (!email) return <span className="text-ink-3">—</span>;
  return (
    <a href={`mailto:${email}`} className={cn("font-mono text-[0.92em] break-all text-ink hover:text-accent", className)}>
      <Ltr>{email}</Ltr>
    </a>
  );
}

export function UrlLink({ url, className }: { url: string | null | undefined; className?: string }) {
  const href = ensureUrl(url);
  if (!href) return <span className="text-ink-3">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("font-mono text-[0.92em] break-all text-accent hover:underline", className)}>
      <Ltr>{displayUrl(url)}</Ltr>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Pagination (server-rendered links)
// ---------------------------------------------------------------------------
export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-9 items-center gap-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink-2 hover:bg-sunken";
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="עימוד">
      <p className="text-sm text-ink-3">
        <Ltr className="num">
          {from}–{to}
        </Ltr>{" "}
        מתוך <span className="num">{total}</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={btn}>
            <ChevronRight className="size-4" aria-hidden />
            הקודם
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={btn}>
            הבא
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Tables: desktop table + mobile cards are rendered side by side and swapped
// by breakpoint, so each gets a layout designed for its width.
// ---------------------------------------------------------------------------
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("hidden overflow-hidden rounded-lg border border-line bg-surface shadow-1 md:block", className)}>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("border-b border-line bg-sunken/60 px-4 py-2.5 text-start text-xs font-medium whitespace-nowrap text-ink-3", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle text-ink-2 group-last:border-b-0", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("group transition-colors hover:bg-sunken/50", className)} {...props} />;
}

export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col gap-2 md:hidden", className)}>{children}</ul>;
}

export function MobileCard({ href, children }: { href?: string; children: ReactNode }) {
  const cls = "block rounded-lg border border-line bg-surface p-4 shadow-1";
  return <li>{href ? <Link href={href} className={cn(cls, "active:bg-sunken")}>{children}</Link> : <div className={cls}>{children}</div>}</li>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}
