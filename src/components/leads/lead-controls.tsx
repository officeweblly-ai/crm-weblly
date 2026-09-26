"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Confirm } from "@/components/ui/confirm";
import { StatusSelect } from "@/components/ui/status-select";
import { deleteLead, setLeadStatus } from "@/lib/actions/leads";
import { leadStatus, type LeadStatus } from "@/lib/domain/labels";

export function LeadStatusControl({ id, status }: { id: string; status: LeadStatus }) {
  return (
    <StatusSelect
      label="סטטוס הליד"
      value={status}
      options={leadStatus.list.filter((o) => o.value !== "converted")}
      toneOf={leadStatus.tone}
      onChange={(v) => setLeadStatus(id, v)}
    />
  );
}

export function DeleteLeadButton({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Confirm
      trigger={children}
      title="מחיקת ליד"
      description={<>הליד &quot;{name}&quot; יימחק לצמיתות. אם כבר הומר ללקוח — תיק הלקוח לא יושפע.</>}
      confirmLabel="מחיקה"
      action={() => deleteLead(id)}
      onDone={() => router.push("/leads")}
    />
  );
}
