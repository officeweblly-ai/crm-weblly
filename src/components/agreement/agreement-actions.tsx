"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { FileCheck2, Link2, Plus, RefreshCw } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { createPartnershipAgreement, regenerateSignedPdf, signedPdfUrl } from "@/lib/actions/agreement";

/** Copies an absolute link to a token page (/agreement/…, /s/…). */
export function CopyLinkButton({ path, label = "העתקת קישור", variant = "secondary", size = "sm", className }: { path: string; label?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string }) {
  const copy = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("הקישור הועתק");
    } catch {
      window.prompt("העתיקו את הקישור:", url);
    }
  };
  return (
    <Button variant={variant} size={size} onClick={copy} className={className}>
      <Link2 aria-hidden />
      {label}
    </Button>
  );
}

export function CreatePartnershipButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await createPartnershipAgreement();
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "נוצר");
          router.push(`/contracts/partnership/${r.data.id}`);
        })
      }
    >
      <Plus aria-hidden />
      יצירת הסכם השותפות
    </Button>
  );
}

/** Opens the stored final signed PDF; offers to re-create it if missing. */
export function SignedPdfButton({ id, version, stored }: { id: string; version: number; stored: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!stored) {
    return (
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await regenerateSignedPdf(id, version);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message ?? "נשמר");
            router.refresh();
          })
        }
      >
        <RefreshCw aria-hidden />
        שמירת עותק חתום
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await signedPdfUrl(id, version);
          if (!r.ok) return void toast.error(r.error);
          window.location.href = r.data.url;
        })
      }
    >
      <FileCheck2 aria-hidden />
      עותק חתום שמור
    </Button>
  );
}
