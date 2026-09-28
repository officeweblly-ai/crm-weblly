"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addProjectToPortfolio } from "@/lib/actions/portfolio";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { StatusSelect } from "@/components/ui/status-select";
import { ProjectFormModal } from "./project-form";
import { deleteProject, setProjectStatus } from "@/lib/actions/crm";
import { projectStatus, type ProjectStatus } from "@/lib/domain/labels";
import type { Tables } from "@/lib/supabase/database.types";

export function ProjectStatusControl({ id, status }: { id: string; status: ProjectStatus }) {
  return <StatusSelect label="שלב הפרויקט" value={status} options={projectStatus.list} toneOf={projectStatus.tone} onChange={(v) => setProjectStatus({ id, status: v })} />;
}

export function ProjectMenu({ project }: { project: Tables<"projects"> }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
        עריכה
      </Button>
      <Menu trigger={<Button variant="secondary" size="icon" aria-label="פעולות נוספות"><MoreHorizontal /></Button>}>
        <MenuItem onSelect={() => setEditing(true)}><Pencil /> עריכת פרטים ותמחור</MenuItem>
        <MenuItem
          onSelect={async () => {
            const r = await addProjectToPortfolio(project.id);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message ?? "נוסף");
            router.push(`/portfolio/${r.data.id}`);
          }}
        >
          <BriefcaseBusiness /> הוספה לתיק עבודות
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive onSelect={() => setDeleting(true)}><Trash2 /> מחיקת פרויקט</MenuItem>
      </Menu>
      <ProjectFormModal project={project} open={editing} onOpenChange={setEditing} />
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="מחיקת פרויקט"
        description={<>הפרויקט &quot;{project.name}&quot; יימחק יחד עם התשלומים, המשימות והקבצים שלו. תיק הלקוח נשאר. לא ניתן לשחזר.</>}
        confirmLabel="מחיקת הפרויקט"
        action={() => deleteProject(project.id)}
        onDone={() => router.push(`/clients/${project.client_id}`)}
      />
    </>
  );
}
