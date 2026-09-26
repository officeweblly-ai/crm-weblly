import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-line-strong bg-surface text-ink placeholder:text-ink-3/80 shadow-[inset_0_1px_1px_rgb(20_24_36/0.03)] transition-[border-color,box-shadow] duration-150 hover:border-ink-3/60 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:bg-sunken disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10 px-3 text-base", className)} {...props} />;
}

/** For phones / emails / URLs: typed left-to-right, aligned with the RTL form edge. */
export function LtrInput({ className, ...props }: ComponentProps<"input">) {
  return <Input dir="ltr" className={cn("text-right placeholder:text-right", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 px-3 py-2 text-base leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-10 appearance-none ps-3 pe-9 text-base", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  );
}

export function Checkbox({ className, label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink-2", className)}>
      <input type="checkbox" className="size-4 shrink-0 cursor-pointer rounded accent-(--accent)" {...props} />
      <span>{label}</span>
    </label>
  );
}

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
};

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink-2">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormGrid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)} {...props} />;
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}
