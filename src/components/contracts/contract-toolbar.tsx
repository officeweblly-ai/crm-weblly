"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2, Printer, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusSelect } from "@/components/ui/status-select";
import { FileUploader } from "@/components/files/file-uploader";
import { attachContractFile, setContractStatus } from "@/lib/actions/contracts";
import { getFileUrl } from "@/lib/actions/files";
import { contractStatus, type ContractStatus } from "@/lib/domain/labels";

export function ContractToolbar({ id, clientId, status, file, canPrint }: { id: string; clientId: string; status: ContractStatus; file: { id: string; original_name: string } | null; canPrint: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <StatusSelect label="סטטוס ההסכם" value={status} options={contractStatus.list} toneOf={contractStatus.tone} onChange={(v) => setContractStatus(id, v)} />
      {file ? (
        <Button
          variant="secondary"
          onClick={async () => {
            const r = await getFileUrl(file.id);
            if (r.ok) window.open(r.data.url, "_blank", "noopener");
            else toast.error(r.error);
          }}
        >
          <FileCheck2 aria-hidden /> העותק החתום
        </Button>
      ) : (
        <Modal
          open={open}
          onOpenChange={setOpen}
          size="sm"
          trigger={
            <Button variant="secondary">
              <Upload aria-hidden /> העלאת עותק חתום
            </Button>
          }
          title="העלאת עותק חתום"
          description="אחרי שהלקוח חתם — מעלים כאן את ה-PDF החתום. הוא יישמר גם בקבצי הלקוח."
        >
          <FileUploader
            clientId={clientId}
            category="contracts"
            multiple={false}
            onUploaded={async (f) => {
              const r = await attachContractFile(id, f.id);
              if (r.ok) {
                await setContractStatus(id, "signed");
                toast.success("העותק החתום נשמר וההסכם סומן כנחתם");
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            }}
          />
        </Modal>
      )}
      {canPrint && (
        <Button onClick={() => window.print()}>
          <Printer aria-hidden /> הורדה כ-PDF / הדפסה
        </Button>
      )}
    </>
  );
}
