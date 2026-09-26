"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { addChecklist } from "@/lib/actions/crm";
import { DEFAULT_CHECKLIST } from "@/lib/domain/labels";

/** Offers the default checklist; the user picks what fits this project. */
export function ChecklistButton({ projectId, existingTitles }: { projectId: string; existingTitles: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const available = DEFAULT_CHECKLIST.filter((c) => !existingTitles.includes(c.title));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(available.map((c) => c.title)));

  const submit = () =>
    start(async () => {
      const r = await addChecklist(projectId, [...selected]);
      if (r.ok) {
        toast.success(r.message ?? "נוסף");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });

  if (!available.length) return null;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="sm"
      trigger={
        <Button variant="secondary" size="sm">
          <ListChecks aria-hidden />
          צ׳קליסט מוכן
        </Button>
      }
      title="הוספת צ׳קליסט"
      description="סמן רק את מה שרלוונטי לפרויקט הזה."
      footer={
        <>
          <Button onClick={submit} loading={pending} disabled={selected.size === 0}>
            הוספת {selected.size} משימות
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="sr-only">משימות</legend>
        <div className="mb-2 flex gap-3 text-sm">
          <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set(available.map((c) => c.title)))}>
            בחירת הכול
          </button>
          <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set())}>
            ניקוי
          </button>
        </div>
        <ul className="flex flex-col">
          {available.map((c) => (
            <li key={c.title}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-sunken">
                <input
                  type="checkbox"
                  className="size-4 accent-(--accent)"
                  checked={selected.has(c.title)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(c.title);
                      else n.delete(c.title);
                      return n;
                    })
                  }
                />
                <span className="text-sm text-ink">{c.title}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </Modal>
  );
}
