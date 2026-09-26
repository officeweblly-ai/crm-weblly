"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSignature, FileText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Confirm } from "@/components/ui/confirm";
import { FileUploader } from "@/components/files/file-uploader";
import { createContract, deleteContract, updateContract } from "@/lib/actions/crm";
import { getFileUrl } from "@/lib/actions/files";
import { contractStatus } from "@/lib/domain/labels";
import { formatDate, todayISO } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import type { ContractRow } from "@/lib/data/crm";

type Opt = { value: string; label: string };

export function ContractFormModal({
  contract,
  clientId,
  projects,
  trigger,
  open: openProp,
  onOpenChange,
}: OpenProps & { contract?: ContractRow; clientId: string; projects: Opt[]; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const [fileId, setFileId] = useState<string | null>(contract?.file_id ?? null);
  const [fileName, setFileName] = useState<string | null>(contract?.files?.original_name ?? null);
  const action = contract ? updateContract.bind(null, contract.id) : createContract;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      if (!contract) {
        setFileId(null);
        setFileName(null);
      }
      router.refresh();
    },
  });
  const formId = contract ? `contract-${contract.id}` : `contract-new-${clientId}`;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={contract ? "עריכת חוזה" : "העלאת חוזה"}
      description={contract ? undefined : "העלה את הקובץ החתום או הטיוטה ושמור את פרטי החוזה."}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending} className="sm:min-w-28">
            {contract ? "שמירה" : "שמירת החוזה"}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="client_id" value={clientId} />
        {fileId && <input type="hidden" name="file_id" value={fileId} />}
        <Field label="שם החוזה" required error={errors.title}>
          {(p) => <Input {...p} name="title" defaultValue={contract?.title ?? "הסכם עבודה"} />}
        </Field>
        <FormGrid>
          <Field label="פרויקט" error={errors.project_id}>
            {(p) => (
              <Select {...p} name="project_id" defaultValue={contract?.project_id ?? projects[0]?.value ?? ""}>
                <option value="">ללא פרויקט ספציפי</option>
                {projects.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="סטטוס" error={errors.status}>
            {(p) => (
              <Select {...p} name="status" defaultValue={contract?.status ?? "sent"}>
                {contractStatus.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="תאריך החוזה" error={errors.contract_date}>
            {(p) => <Input {...p} name="contract_date" type="date" defaultValue={contract?.contract_date ?? todayISO()} />}
          </Field>
          <Field label="תאריך חתימה" hint="מתמלא אוטומטית כשהסטטוס 'נחתם'" error={errors.signed_at}>
            {(p) => <Input {...p} name="signed_at" type="date" defaultValue={contract?.signed_at ?? ""} />}
          </Field>
        </FormGrid>
        <div>
          <div className="mb-1.5 text-sm font-medium text-ink-2">קובץ</div>
          {fileId ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-sunken/50 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">{fileName}</span>
              </span>
              <Button variant="link" size="sm" onClick={() => { setFileId(null); setFileName(null); }}>
                החלפה
              </Button>
            </div>
          ) : (
            <FileUploader
              clientId={clientId}
              category="contracts"
              multiple={false}
              compact
              onUploaded={(f) => {
                setFileId(f.id);
                setFileName(f.name);
              }}
            />
          )}
        </div>
        <Field label="הערות" error={errors.notes}>
          {(p) => <Textarea {...p} name="notes" defaultValue={contract?.notes ?? ""} rows={2} />}
        </Field>
      </form>
    </Modal>
  );
}

function ContractItem({ c, projects }: { c: ContractRow; projects: Opt[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [withFile, setWithFile] = useState(false);
  const [pending, start] = useTransition();
  const signed = c.status === "signed";

  const openFile = () =>
    start(async () => {
      if (!c.file_id) return;
      const r = await getFileUrl(c.file_id);
      if (r.ok) window.open(r.data.url, "_blank", "noopener");
      else toast.error(r.error);
    });

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-sunken text-ink-3">
        <FileSignature className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/contracts/${c.id}`} className="font-medium text-ink hover:text-accent">{c.title}</Link>
          {c.contract_number && <bdi dir="ltr" className="text-xs text-ink-3">{c.contract_number}</bdi>}
          <Badge tone={contractStatus.tone(c.status)}>{contractStatus.label(c.status)}</Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
          <span>נחתם: {signed ? `כן${c.signed_at ? ` · ${formatDate(c.signed_at)}` : ""}` : "לא"}</span>
          {c.contract_date && <span>תאריך: {formatDate(c.contract_date)}</span>}
          {c.projects && <span>{c.projects.name}</span>}
        </div>
        {c.notes && <p className="mt-1 text-xs text-ink-3">{c.notes}</p>}
      </div>
      {c.file_id && (
        <Button variant="secondary" size="sm" onClick={openFile} loading={pending}>
          פתיחה
        </Button>
      )}
      <Menu trigger={<Button variant="ghost" size="icon-sm" aria-label={`פעולות: ${c.title}`}><MoreHorizontal /></Button>}>
        <MenuItem onSelect={() => setEditing(true)}><Pencil /> עריכה</MenuItem>
        <MenuItem destructive onSelect={() => setDeleting(true)}><Trash2 /> מחיקה</MenuItem>
      </Menu>
      <ContractFormModal contract={c} clientId={c.client_id} projects={projects} open={editing} onOpenChange={setEditing} />
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="מחיקת חוזה"
        description={
          <div className="flex flex-col gap-2">
            <p>רשומת החוזה &quot;{c.title}&quot; תימחק.</p>
            {c.file_id && <Checkbox label="למחוק גם את הקובץ מהאחסון" checked={withFile} onChange={(e) => setWithFile(e.target.checked)} />}
          </div>
        }
        confirmLabel="מחיקה"
        action={() => deleteContract(c.id, withFile)}
        onDone={() => router.refresh()}
      />
    </li>
  );
}

export function ContractList({ contracts, projects }: { contracts: ContractRow[]; projects: Opt[] }) {
  return (
    <ul className="divide-y divide-line">
      {contracts.map((c) => (
        <ContractItem key={c.id} c={c} projects={projects} />
      ))}
    </ul>
  );
}
