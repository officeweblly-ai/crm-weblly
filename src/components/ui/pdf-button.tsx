"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Downloads a real PDF rendered on the server (/api/pdf). On iPhone it opens the
 * share sheet ("Save to Files", WhatsApp, Mail); elsewhere it saves the file.
 * If the server can't render, it falls back to the browser's print dialog.
 */
export function PdfButton({ path, name, version, label = "הורדת PDF", variant = "primary", size, className }: { path: string; name: string; version?: number; label?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const id = toast.loading("מכין PDF…");
    try {
      const q = new URLSearchParams({ path, name });
      if (version) q.set("v", String(version));
      const res = await fetch(`/api/pdf?${q}`, { credentials: "same-origin" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? "הפקת ה-PDF נכשלה");
      }
      const blob = await res.blob();
      const fileName = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        toast.dismiss(id);
        try {
          await navigator.share({ files: [file], title: fileName });
        } catch {
          /* the person closed the share sheet */
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        toast.success("ה-PDF ירד", { id });
      }
    } catch (e) {
      toast.error((e as Error).message, {
        id,
        action: { label: "הדפסה", onClick: () => window.print() },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={variant} size={size} loading={busy} onClick={run} className={className}>
      <Download aria-hidden /> {label}
    </Button>
  );
}

export function PrintIconButton() {
  return (
    <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label="הדפסה" title="הדפסה">
      <Printer aria-hidden />
    </Button>
  );
}
