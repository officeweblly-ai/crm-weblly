"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, LtrInput } from "@/components/ui/field";
import { signIn } from "@/lib/actions/auth";
import { useFormAction } from "@/lib/use-form-action";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const { pending, errors, formError, onSubmit } = useFormAction(signIn, {
    onSuccess: ({ next }) => {
      router.replace(next);
      router.refresh();
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-2" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={formError} />
      <Field label="אימייל" error={errors.email}>
        {(p) => <LtrInput {...p} name="email" type="email" autoComplete="email" required placeholder="you@studio.co.il" />}
      </Field>
      <Field label="סיסמה" error={errors.password}>
        {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1">
        התחברות
      </Button>
    </form>
  );
}
