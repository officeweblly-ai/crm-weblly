"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveClientSuggestions } from "@/lib/actions/crm";

export type Suggestion = { submissionId: string; title: string; items: { field: string; label: string; current: string | null; next: string }[] };

/**
 * The questionnaire brought details that differ from the client file. Nothing
 * was overwritten — a person picks what to take.
 */
export function ClientSuggestions({ suggestion }: { suggestion: Suggestion }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(suggestion.items.map((i) => i.field)));
  const [pending, start] = useTransition();
  const run = (apply: string[]) =>
    start(async () => {
      const r = await resolveClientSuggestions(suggestion.submissionId, apply);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <section className="mb-5 rounded-lg border border-accent/25 bg-accent-soft/60 p-4 sm:p-5" aria-label="פרטים חדשים מהשאלון">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">הלקוח מילא בשאלון פרטים שונים ממה שבתיק</h2>
          <p className="mt-0.5 text-sm text-ink-2">מ״{suggestion.title}״. פרטים שהיו חסרים כבר הושלמו אוטומטית — כאן רק מה שסותר. בחרו מה לעדכן:</p>
          <ul className="mt-3 flex flex-col gap-2">
            {suggestion.items.map((i) => (
              <li key={i.field}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                    checked={chosen.has(i.field)}
                    onChange={(e) =>
                      setChosen((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(i.field);
                        else n.delete(i.field);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink-3">{i.label}</span>
                    <span className="block break-words">
                      <span className="text-ink-3 line-through">{i.current}</span>
                      <span aria-hidden> ← </span>
                      <span className="font-medium text-ink">{i.next}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={pending} disabled={!chosen.size} onClick={() => run([...chosen])}>
              עדכון {chosen.size === suggestion.items.length ? "הכול" : `${chosen.size} פרטים`}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run([])}>
              להשאיר כמו שזה
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
