import { cn } from "@/lib/utils";

/** weblly brand colors, taken from the official logo artwork. */
export const BRAND = { navy: "#1c2034", line: "#d5e2ff", ink: "#1f2440", spark: "#fc7a57" } as const;

/**
 * The weblly mark: a rising zig-zag of four nodes ending in an orange spark.
 * `tone="light"` = for light backgrounds (navy line), `tone="dark"` = for dark backgrounds,
 * `tone="mono"` = black only (legal documents, print).
 */
export function LogoMark({ className, tone = "light", title }: { className?: string; tone?: "light" | "dark" | "mono"; title?: string }) {
  const line = tone === "dark" ? BRAND.line : tone === "mono" ? "#111111" : BRAND.ink;
  const spark = tone === "mono" ? "#111111" : BRAND.spark;
  return (
    <svg viewBox="0 0 66 52" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} fill="none">
      <polyline points="7,44 20,15 34,44 47,15 59,7" stroke={line} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="44" r="4.3" fill={line} />
      <circle cx="20" cy="15" r="4.3" fill={line} />
      <circle cx="34" cy="44" r="4.3" fill={line} />
      <circle cx="47" cy="15" r="4.3" fill={line} />
      <circle cx="59" cy="7" r="5.2" fill={spark} />
    </svg>
  );
}

/** Mark + WEBLLY wordmark. The wordmark is Latin, so it is always laid out LTR. */
export function Logo({ className, tone = "light", size = "md" }: { className?: string; tone?: "light" | "dark" | "mono"; size?: "sm" | "md" | "lg" }) {
  const s = { sm: { mark: "h-5", text: "text-base" }, md: { mark: "h-6", text: "text-lg" }, lg: { mark: "h-9", text: "text-3xl" } }[size];
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn(s.mark, "w-auto shrink-0")} tone={tone} />
      <span className={cn(s.text, "font-bold leading-none tracking-[0.02em]", tone === "dark" ? "text-white" : tone === "mono" ? "text-[#111]" : "text-ink")} style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        WEBLLY
      </span>
    </span>
  );
}
