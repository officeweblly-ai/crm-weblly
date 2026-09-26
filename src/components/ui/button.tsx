import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-accent text-white shadow-1 hover:bg-accent-hover active:translate-y-px disabled:bg-accent/50",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-1 hover:bg-sunken hover:border-line-strong active:translate-y-px disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink disabled:text-ink-3",
  danger: "bg-danger text-white shadow-1 hover:bg-danger/90 active:translate-y-px disabled:bg-danger/50",
  "danger-ghost": "text-danger hover:bg-danger-soft disabled:text-danger/50",
  link: "text-accent hover:text-accent-hover underline-offset-4 hover:underline px-0! h-auto!",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-5 text-base gap-2 rounded-lg",
  icon: "size-10 rounded-md",
  "icon-sm": "size-8 rounded-md",
} as const;

export type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  asChild?: boolean;
};

export function buttonClass(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", loading, asChild, className, children, disabled, type, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={buttonClass(variant, size, className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
