"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Ltr, MobileCard, MobileList, Money, TableShell, Td, Th, Tr } from "@/components/ui/misc";
import { PaymentFormModal } from "./payment-form";
import { deletePayment } from "@/lib/actions/crm";
import { paymentKind, paymentMethod } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

export type PaymentRow = Tables<"payments"> & { projects: { id: string; name: string; client_id: string } | null };

function RowActions({ p }: { p: PaymentRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`פעולות לתשלום ${formatMoney(p.amount)}`}>
            <MoreHorizontal />
          </Button>
        }
      >
        <MenuItem onSelect={() => setEditing(true)}>
          <Pencil /> עריכה
        </MenuItem>
        <MenuItem destructive onSelect={() => setDeleting(true)}>
          <Trash2 /> מחיקה
        </MenuItem>
      </Menu>
      <PaymentFormModal payment={p} open={editing} onOpenChange={setEditing} />
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="מחיקת תשלום"
        description={<>התשלום על סך <bdi dir="ltr">{formatMoney(p.amount)}</bdi> יימחק והיתרה של הפרויקט תחושב מחדש. לא ניתן לבטל את הפעולה.</>}
        confirmLabel="מחיקת התשלום"
        action={() => deletePayment(p.id)}
      />
    </>
  );
}

export function PaymentsTable({ payments, showProject = true }: { payments: PaymentRow[]; showProject?: boolean }) {
  return (
    <>
      <TableShell className="shadow-none">
        <thead>
          <tr>
            <Th>תאריך</Th>
            <Th>סכום</Th>
            {showProject && <Th>פרויקט</Th>}
            <Th>אמצעי</Th>
            <Th>סוג</Th>
            <Th>אסמכתא / הערה</Th>
            <Th className="w-12"><span className="sr-only">פעולות</span></Th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <Tr key={p.id}>
              <Td className="whitespace-nowrap">{formatDate(p.paid_at)}</Td>
              <Td className="font-semibold text-ink"><Money value={p.amount} /></Td>
              {showProject && (
                <Td>
                  {p.projects ? (
                    <Link href={`/projects/${p.projects.id}`} className="hover:text-accent">{p.projects.name}</Link>
                  ) : "—"}
                </Td>
              )}
              <Td>{paymentMethod.label(p.method)}</Td>
              <Td>{paymentKind.label(p.kind)}</Td>
              <Td className="max-w-64 truncate text-ink-3">
                {p.reference && <Ltr className="font-mono text-xs">{p.reference}</Ltr>}
                {p.reference && p.note && " · "}
                {p.note}
              </Td>
              <Td><RowActions p={p} /></Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <MobileList>
        {payments.map((p) => (
          <MobileCard key={p.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold text-ink"><Money value={p.amount} /></div>
                <div className="text-sm text-ink-3">
                  {formatDate(p.paid_at)} · {paymentMethod.label(p.method)} · {paymentKind.label(p.kind)}
                </div>
                {showProject && p.projects && <div className="mt-1 text-sm text-ink-2">{p.projects.name}</div>}
                {(p.reference || p.note) && <div className="mt-1 text-xs text-ink-3">{[p.reference, p.note].filter(Boolean).join(" · ")}</div>}
              </div>
              <RowActions p={p} />
            </div>
          </MobileCard>
        ))}
      </MobileList>
    </>
  );
}
