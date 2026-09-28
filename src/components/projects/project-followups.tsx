"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BriefcaseBusiness, Clapperboard, ListChecks, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChecklistButton } from "@/components/tasks/checklist-button";
import { addProjectToPortfolio } from "@/lib/actions/portfolio";
import { moveClientToMaintenance, openSocialAlbumForProject } from "@/lib/actions/project-hub";

/**
 * Small automations, shown as suggestions — nothing changes until the user
 * clicks. Each suggestion disappears once it's done.
 */
export function ProjectFollowUps({
  projectId,
  existingTaskTitles,
  offerDevChecklist,
  completed,
  portfolioId,
  albumId,
  clientInMaintenance,
}: {
  projectId: string;
  existingTaskTitles: string[];
  offerDevChecklist: boolean;
  completed: boolean;
  portfolioId: string | null;
  albumId: string | null;
  clientInMaintenance: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = <T,>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, go?: (data: T) => string | null) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "בוצע");
      const to = go?.(r.data);
      if (to) router.push(to);
      else router.refresh();
    });

  const showCompleted = completed && (!portfolioId || !albumId || !clientInMaintenance);
  if (!offerDevChecklist && !showCompleted) return null;

  return (
    <div className="flex flex-col gap-3">
      {offerDevChecklist && (
        <div className="flex flex-col gap-3 rounded-lg border border-ok/25 bg-ok-soft/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            <span className="font-semibold">הלקוח אישר את העיצוב.</span> להוסיף צ׳קליסט פיתוח לפרויקט?
          </p>
          <ChecklistButton
            projectId={projectId}
            existingTitles={existingTaskTitles}
            list="dev"
            trigger={
              <Button size="sm" variant="secondary">
                <ListChecks aria-hidden />
                בחירת משימות פיתוח
              </Button>
            }
          />
        </div>
      )}
      {showCompleted && (
        <div className="rounded-lg border border-accent/20 bg-accent-soft/50 px-4 py-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">הפרויקט הסתיים.</span> מה עושים עכשיו?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!portfolioId && (
              <Button size="sm" loading={pending} onClick={() => run(() => addProjectToPortfolio(projectId), (d) => `/portfolio/${d.id}`)}>
                <BriefcaseBusiness aria-hidden />
                הוספה לתיק עבודות
              </Button>
            )}
            {!albumId && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => openSocialAlbumForProject(projectId), (d) => `/social/${d.id}`)}>
                <Clapperboard aria-hidden />
                פתיחת תיקיית סושיאל
              </Button>
            )}
            {!clientInMaintenance && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => moveClientToMaintenance(projectId))}>
                <Wrench aria-hidden />
                העברת הלקוח לתחזוקה
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
