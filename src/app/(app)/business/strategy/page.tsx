import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalCard, GoalFormModal, GoalsEmpty } from "@/components/business/goals";
import { StrategyForm } from "@/components/business/strategy-form";
import { requireArea } from "@/lib/auth";
import { goalsWithProgress } from "@/lib/data/business";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "אסטרטגיה ויעדים" };

export default async function StrategyPage() {
  await requireArea("strategy");
  const supabase = await createClient();
  const [{ data: strategy }, goals, { data: people }] = await Promise.all([
    supabase.from("business_strategy").select("*").maybeSingle(),
    goalsWithProgress(supabase),
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
  ]);
  const staff = (people ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email }));
  const nameOf = new Map(staff.map((s) => [s.value, s.label.split(" ")[0]]));
  const editor = strategy?.updated_by ? nameOf.get(strategy.updated_by) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <StrategyForm strategy={strategy} />
        {strategy?.updated_at && (
          <p className="mt-3 text-xs text-ink-3">עודכן לאחרונה {formatDateTime(strategy.updated_at)}{editor ? ` · ${editor}` : ""}</p>
        )}
      </div>
      <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-24 xl:self-start">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">יעדים</h2>
          {goals.length > 0 && <GoalFormModal staff={staff} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />יעד</Button>} />}
        </div>
        {goals.length ? goals.map((g) => <GoalCard key={g.id} goal={g} staff={staff} ownerName={g.owner_id ? nameOf.get(g.owner_id) : null} canEdit />) : <GoalsEmpty staff={staff} />}
      </aside>
    </div>
  );
}
