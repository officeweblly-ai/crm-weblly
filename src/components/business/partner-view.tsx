"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfButton } from "@/components/ui/pdf-button";
import type { PartnerAgreement } from "@/lib/domain/partners";
import { PartnerEditor } from "./partner-editor";

/** Toggles between the printable document and the editor. */
export function PartnerView({ id, title, content, signed, children, status }: { id: string; title: string; content: PartnerAgreement; signed: boolean; children: ReactNode; status: ReactNode }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <PartnerEditor id={id} title={title} content={content} signed={signed} onClose={() => setEditing(false)} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">{status}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> עריכה
          </Button>
          <PdfButton path="/business/partners" name={title} />
        </div>
      </div>
      {children}
    </>
  );
}
