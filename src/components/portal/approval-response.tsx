"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { respondToApproval } from "@/lib/actions/portal";
import { useFormAction } from "@/lib/use-form-action";

/** Approve, or ask for changes with a note. The decision is final once sent. */
export function ApprovalResponse({ token, approvalId }: { token: string; approvalId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const { pending, errors, onSubmit } = useFormAction(respondToApproval.bind(null, token), {
    onSuccess: () => router.refresh(),
  });
  const formId = `approval-${approvalId}`;

  return (
    <form id={formId} onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4" noValidate>
      <input type="hidden" name="approval_id" value={approvalId} />
      {mode === "changes" ? (
        <>
          <input type="hidden" name="decision" value="changes_requested" />
          <Field label="מה תרצו לשנות?" required error={errors.comment}>
            {(p) => <Textarea {...p} name="comment" rows={4} autoFocus placeholder="למשל: להגדיל את הלוגו, להחליף את התמונה הראשית…" />}
          </Field>
          <Field label="השם שלכם" hint="לא חובה — כדי שנדע ממי ההערה">
            {(p) => <Input {...p} name="author" maxLength={120} autoComplete="name" />}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="submit" loading={pending} className="sm:min-w-36">
              שליחת בקשת שינוי
            </Button>
            <Button variant="secondary" onClick={() => setMode("idle")} disabled={pending}>
              חזרה
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* FormData ignores the submit button, so the decision travels in a hidden field. */}
          <input type="hidden" name="decision" value="approved" />
          <Button type="submit" loading={pending} className="sm:min-w-36" size="lg">
            <Check aria-hidden />
            מאשר/ת
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setMode("changes")} disabled={pending}>
            <PencilLine aria-hidden />
            מבקש/ת שינוי
          </Button>
        </div>
      )}
    </form>
  );
}
