"use client";

import { Direction, Tooltip } from "radix-ui";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Direction.Provider dir="rtl">
      <Tooltip.Provider delayDuration={300}>
        {children}
        <Toaster
          dir="rtl"
          position="top-center"
          closeButton
          toastOptions={{
            classNames: {
              toast: "!font-sans !rounded-lg !border-line !shadow-3 !text-sm",
              title: "!font-medium !text-ink",
              description: "!text-ink-3",
            },
          }}
        />
      </Tooltip.Provider>
    </Direction.Provider>
  );
}
