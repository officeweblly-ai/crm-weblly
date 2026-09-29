"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearReadNotifications, markNotificationsRead } from "@/lib/actions/notifications";

export function InboxActions({ hasUnread, hasRead }: { hasUnread: boolean; hasRead: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      }
    });
  return (
    <>
      {hasUnread && (
        <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => markNotificationsRead())}>
          <CheckCheck aria-hidden /> סימון הכול כנקרא
        </Button>
      )}
      {hasRead && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(clearReadNotifications)}>
          <Trash2 aria-hidden /> ניקוי שנקראו
        </Button>
      )}
    </>
  );
}
