import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-1", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

/** Definition list used on detail pages: label on top, value below. */
export function DataList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)} {...props} />;
}

export function DataItem({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{children ?? <span className="text-ink-3">—</span>}</dd>
    </div>
  );
}
