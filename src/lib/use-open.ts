"use client";

import { useState } from "react";

/** Open state that can be controlled by a parent or left uncontrolled. */
export function useOpenState(opts: { open?: boolean; onOpenChange?: (o: boolean) => void; defaultOpen?: boolean }) {
  const [inner, setInner] = useState(opts.defaultOpen ?? false);
  const open = opts.open ?? inner;
  const setOpen = (o: boolean) => {
    if (opts.open === undefined) setInner(o);
    opts.onOpenChange?.(o);
  };
  return [open, setOpen] as const;
}

export type OpenProps = { open?: boolean; onOpenChange?: (o: boolean) => void };
