"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { deleteClientRecord, setClientArchived, setClientStatus } from "@/lib/actions/crm";
import { StatusSelect } from "@/components/ui/status-select";
import { clientStatus, type ClientStatus } from "@/lib/domain/labels";

export function ClientMenu({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"archive" | "delete" | null>(null);
  return (
    <>
      <Menu trigger={<Button variant="secondary" size="icon" aria-label="פעולות נוספות"><MoreHorizontal /></Button>}>
        <MenuItem onSelect={() => setDialog("archive")}>
          {archived ? <><ArchiveRestore /> החזרה מהארכיון</> : <><Archive /> העברה לארכיון</>}
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive onSelect={() => setDialog("delete")}>
          <Trash2 /> מחיקת לקוח
        </MenuItem>
      </Menu>
      <Confirm
        open={dialog === "archive"}
        onOpenChange={(o) => !o && setDialog(null)}
        destructive={false}
        title={archived ? "החזרה מהארכיון" : "העברה לארכיון"}
        description={archived ? `"${name}" יחזור לרשימת הלקוחות הפעילים.` : `"${name}" יוסתר מהרשימות ומלוח הפרויקטים. כל הנתונים נשמרים ואפשר להחזיר בכל רגע.`}
        confirmLabel={archived ? "החזרה" : "העברה לארכיון"}
        action={() => setClientArchived(id, !archived)}
        onDone={() => router.refresh()}
      />
      <Confirm
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="מחיקת לקוח לצמיתות"
        description={
          <>
            <p>
              מחיקת &quot;{name}&quot; תמחק גם את <strong>כל</strong> הפרויקטים, התשלומים, השאלונים והתשובות, הקבצים, החוזים, המשימות וההערות שלו.
            </p>
            <p className="mt-2">לא ניתן לשחזר. אם רק סיימתם לעבוד יחד — עדיף להעביר לארכיון.</p>
          </>
        }
        confirmLabel="מחיקה לצמיתות"
        action={() => deleteClientRecord(id)}
        onDone={() => router.push("/clients")}
      />
    </>
  );
}

export function ClientStatusControl({ id, status }: { id: string; status: ClientStatus }) {
  return <StatusSelect label="סטטוס הלקוח" value={status} options={clientStatus.list} toneOf={clientStatus.tone} onChange={(v) => setClientStatus(id, v)} />;
}
