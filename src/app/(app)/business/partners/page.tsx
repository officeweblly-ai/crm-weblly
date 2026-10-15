import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** The partnership agreement now lives in the contracts module. */
export default async function PartnersPage() {
  await requireArea("partners");
  const supabase = await createClient();
  const { data } = await supabase.from("partner_agreements").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  redirect(data ? `/contracts/partnership/${data.id}` : "/contracts");
}
