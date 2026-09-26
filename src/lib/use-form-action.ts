"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Submits a form to a server action without resetting it on failure,
 * prevents double submits, surfaces field errors and toasts the outcome.
 */
export function useFormAction<T>(
  action: (fd: FormData) => Promise<ActionResult<T>>,
  opts: { onSuccess?: (data: T) => void } = {},
) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    start(async () => {
      let r: ActionResult<T>;
      try {
        r = await action(fd);
      } catch {
        r = { ok: false, error: "אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב." };
      }
      if (r.ok) {
        setErrors({});
        setFormError(null);
        if (r.message) toast.success(r.message);
        opts.onSuccess?.(r.data);
      } else {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        toast.error(r.error);
      }
    });
  };

  return { pending, errors, formError, onSubmit, clearErrors: () => setErrors({}) };
}
