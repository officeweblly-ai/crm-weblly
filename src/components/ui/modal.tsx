"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

/**
 * Bottom sheet on phones, centered dialog from `sm` up. Body scrolls, header
 * and footer stay put so the primary action is always reachable.
 */
export function Modal({ open, onOpenChange, trigger, title, description, children, footer, size = "md" }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-[fade-in_180ms_ease-out] data-[state=closed]:animate-[fade-out_140ms_ease-in]" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-surface shadow-3 outline-none",
            "data-[state=open]:animate-[sheet-in_260ms_cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:animate-[sheet-out_180ms_ease-in]",
            "sm:inset-x-0 sm:bottom-auto sm:top-[8vh] sm:mx-auto sm:max-h-[84vh] sm:w-[calc(100vw-2rem)] sm:rounded-xl",
            "sm:data-[state=open]:animate-[pop-in_200ms_cubic-bezier(0.2,0.8,0.2,1)] sm:data-[state=closed]:animate-[fade-out_140ms_ease-in]",
            size === "sm" && "sm:max-w-md",
            size === "md" && "sm:max-w-xl",
            size === "lg" && "sm:max-w-3xl",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-3 pt-3 sm:pt-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-ink-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : ""}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-me-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink" aria-label="סגירה">
              <X className="size-5" />
            </Dialog.Close>
          </header>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-start">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalClose = Dialog.Close;
