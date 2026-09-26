"use client";

import { AlertDialog } from "radix-ui";
import { useTransition, type ReactNode } from "react";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { toast } from "sonner";
import { Button } from "./button";
import type { ActionResult } from "@/lib/actions/result";

type ConfirmProps = OpenProps & {
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Server action; its message is shown as a toast. */
  action: () => Promise<ActionResult<unknown>>;
  onDone?: () => void;
  destructive?: boolean;
};

/** Confirmation dialog for destructive / irreversible actions. */
export function Confirm({ trigger, title, description, confirmLabel, action, onDone, destructive = true, open: openProp, onOpenChange }: ConfirmProps) {
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await action();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        setOpen(false);
        onDone?.();
      } else {
        toast.error(r.error);
      }
    });

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      {trigger && <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-[fade-in_180ms_ease-out]" />
        <AlertDialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 rounded-xl bg-surface p-5 shadow-3 outline-none data-[state=open]:animate-[fade-in_160ms_ease-out]">
          <AlertDialog.Title className="text-lg font-semibold text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-ink-2">{description}</div>
          </AlertDialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant={destructive ? "danger" : "primary"} loading={pending} onClick={run} className="sm:min-w-28">
              {confirmLabel}
            </Button>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                ביטול
              </Button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
