"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { PdfButton } from "@/components/ui/pdf-button";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { respondToProposal } from "@/lib/actions/proposals";
import { useFormAction } from "@/lib/use-form-action";

/** Accept (with a name) or decline (with an optional note). Final once sent. */
export function ProposalResponse({ token }: { token: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "accept" | "reject">("idle");
  const { pending, errors, onSubmit } = useFormAction(respondToProposal.bind(null, token), { onSuccess: () => router.refresh() });

  if (mode === "idle") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={() => setMode("accept")} className="sm:min-w-44">
          <Check aria-hidden />
          אישור ההצעה
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setMode("reject")}>
          <X aria-hidden />
          לא מתאים כרגע
        </Button>
        <PdfButton path={`/o/${token}`} name="הצעת מחיר" label="שמירה כ-PDF" variant="ghost" size="lg" className="sm:ms-auto" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="decision" value={mode === "accept" ? "accepted" : "rejected"} />
      {mode === "accept" ? (
        <Field label="השם המלא שלכם" required hint="כאישור שקראתם את ההצעה ומאשרים אותה" error={errors.name}>
          {(p) => <Input {...p} name="name" autoFocus autoComplete="name" maxLength={120} />}
        </Field>
      ) : (
        <Field label="רוצים לספר לנו למה?" hint="לא חובה — זה עוזר לנו להשתפר" error={errors.note}>
          {(p) => <Textarea {...p} name="note" rows={3} autoFocus />}
        </Field>
      )}
      {mode === "accept" && (
        <Field label="הערה" hint="לא חובה" error={errors.note}>
          {(p) => <Textarea {...p} name="note" rows={2} />}
        </Field>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="submit" size="lg" loading={pending} className="sm:min-w-44">
          {mode === "accept" ? "אישור ושליחה" : "שליחה"}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setMode("idle")} disabled={pending}>
          חזרה
        </Button>
      </div>
    </form>
  );
}
