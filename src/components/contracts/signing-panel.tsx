"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Copy, FileCheck2, MessageCircle, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { revokeSignLink, sendContractForSignature } from "@/lib/actions/contracts";
import { formatDateTime, whatsappLink } from "@/lib/format";

export type VersionRow = { version: number; created_at: string; signatures: { signer_name: string; signed_at: string; ip: string | null }[] };

/**
 * Digital signature: freeze the current text as a version, send a secure link,
 * see who signed which version. Signed versions are never edited — changing
 * the text creates the next version.
 */
export function SigningPanel({
  id,
  status,
  version,
  link,
  clientPhone,
  clientName,
  title,
  versions,
  canSign,
}: {
  id: string;
  status: string;
  version: number;
  link: string | null;
  clientPhone: string | null;
  clientName: string;
  title: string;
  versions: VersionRow[];
  canSign: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(status === "sent" ? link : null);
  const [revoking, setRevoking] = useState(false);

  const send = () =>
    start(async () => {
      const r = await sendContractForSignature(id);
      if (!r.ok) return void toast.error(r.error);
      setUrl(r.data.url);
      toast.success(r.message ?? "מוכן");
      router.refresh();
    });
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("הקישור הועתק");
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  };
  const wa = url ? whatsappLink(clientPhone, `היי ${clientName}, מצורף ההסכם "${title}" לקריאה וחתימה דיגיטלית: ${url}`) : null;

  return (
    <Card className="print:hidden">
      <CardHeader title="חתימה דיגיטלית" description="הלקוח קורא, מאשר וחותם מהטלפון. כל גרסה שנשלחה נשמרת ולא משתנה." />
      <CardBody className="flex flex-col gap-4">
        {!canSign ? (
          <p className="text-sm text-ink-3">חתימה דיגיטלית זמינה להסכם שנוצר במערכת. להסכם שהועלה כקובץ — מעלים עותק חתום.</p>
        ) : status === "signed" ? (
          <p className="flex items-center gap-2 text-sm text-ok">
            <ShieldCheck className="size-4" aria-hidden />
            ההסכם נחתם. כדי לשנות משהו — עורכים, ותיווצר גרסה {version + 1} לשליחה מחדש.
          </p>
        ) : url ? (
          <>
            <div className="flex items-center gap-2 rounded-md border border-line bg-sunken/60 px-3 py-2">
              <ShieldCheck className="size-4 shrink-0 text-ok" aria-hidden />
              <bdi dir="ltr" className="min-w-0 flex-1 truncate text-right font-mono text-xs text-ink-2">{url}</bdi>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copy}><Copy aria-hidden />העתקה</Button>
              {wa && (
                <Button asChild size="sm" variant="secondary">
                  <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />וואטסאפ</a>
                </Button>
              )}
              <Button size="sm" variant="danger-ghost" onClick={() => setRevoking(true)}><Ban aria-hidden />ביטול הקישור</Button>
            </div>
            <p className="text-xs text-ink-3">נשלחה גרסה {version}. אם תערכו את ההסכם — הקישור יציג &quot;בעדכון&quot; עד שתשלחו שוב.</p>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink-2">{versions.length ? `ההסכם נערך אחרי השליחה — זו גרסה ${version}.` : "שולחים ללקוח קישור מאובטח לקריאה וחתימה."}</p>
            <Button onClick={send} loading={pending}>
              <PenLine aria-hidden />
              {versions.length ? `שליחת גרסה ${version} לחתימה` : "שליחה לחתימה"}
            </Button>
          </div>
        )}

        {versions.length > 0 && (
          <div className="border-t border-line pt-3">
            <h3 className="mb-2 text-xs font-medium text-ink-3">גרסאות שנשלחו</h3>
            <ul className="flex flex-col gap-2">
              {versions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">גרסה {v.version}</span>
                    <span className="text-ink-3"> · {formatDateTime(v.created_at)}</span>
                    {v.signatures.map((sig) => (
                      <span key={sig.signed_at} className="block text-xs text-ok">
                        נחתמה ע״י {sig.signer_name} · {formatDateTime(sig.signed_at)}
                        {sig.ip && <span className="text-ink-3"> · IP <bdi dir="ltr">{sig.ip}</bdi></span>}
                      </span>
                    ))}
                  </span>
                  {v.signatures.length > 0 && (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/contracts/${id}/signed?v=${v.version}`}><FileCheck2 aria-hidden />העותק החתום</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
      <Confirm
        open={revoking}
        onOpenChange={setRevoking}
        title="ביטול קישור החתימה"
        description="הקישור יפסיק לעבוד מיד וההסכם יחזור לטיוטה. אפשר לשלוח קישור חדש בכל רגע."
        confirmLabel="ביטול הקישור"
        action={() => revokeSignLink(id)}
        onDone={() => {
          setUrl(null);
          router.refresh();
        }}
      />
    </Card>
  );
}
