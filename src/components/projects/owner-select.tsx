"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setProjectOwner } from "@/lib/actions/team";
import { cn } from "@/lib/utils";

/** Who owns the project — change requests and project suggestions go to them. */
export function OwnerSelect({ projectId, ownerId, staff }: { projectId: string; ownerId: string | null; staff: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(ownerId ?? "");
  return (
    <select
      aria-label="אחראי על הפרויקט"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          setValue(next);
          const r = await setProjectOwner(projectId, next || null);
          if (r.ok) {
            toast.success(r.message ?? "עודכן");
            router.refresh();
          } else toast.error(r.error);
        });
      }}
      className={cn(
        "h-10 w-full rounded-md border px-3 text-sm focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15",
        value ? "border-line-strong bg-surface text-ink" : "border-line-strong bg-sunken/60 text-ink-3",
      )}
    >
      <option value="">לפי תחומי האחריות</option>
      {staff.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
