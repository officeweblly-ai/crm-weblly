"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { saveSubmissionNotes } from "@/lib/actions/questionnaires";

export function SubmissionNotes({ id, value }: { id: string; value: string | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState(value ?? "");
  const [pending, start] = useTransition();
  const changed = draft !== (value ?? "");
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`sn-${id}`} className="sr-only">הערות פנימיות לשאלון</label>
      <Textarea id={`sn-${id}`} rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="סיכום, דברים לבדוק, החלטות — הלקוח לא רואה את זה." />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-3">התשובות המקוריות של הלקוח לא משתנות.</span>
        <Button
          size="sm"
          disabled={!changed}
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await saveSubmissionNotes(id, draft);
              if (r.ok) {
                toast.success(r.message ?? "נשמר");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          שמירה
        </Button>
      </div>
    </div>
  );
}
