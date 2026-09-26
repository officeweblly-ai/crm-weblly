"use client";

import { DropdownMenu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-3 data-[state=open]:animate-[menu-in_140ms_ease-out]"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ className, destructive, ...props }: ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-2 outline-none select-none data-highlighted:bg-sunken data-highlighted:text-ink data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-3",
        destructive && "text-danger data-highlighted:bg-danger-soft data-highlighted:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-ink-3">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}
