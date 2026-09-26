import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leadSource, leadStatus, type LeadSource, type LeadStatus } from "@/lib/domain/labels";
import { pageRange, PAGE_SIZE, searchPattern } from "@/lib/utils";

export type LeadFilters = { q?: string; status?: string; source?: string; sort?: string; page: number };

export async function listLeads(f: LeadFilters) {
  const supabase = await createClient();
  let query = supabase.from("leads").select("*", { count: "exact" });

  if (f.q) {
    const p = searchPattern(f.q);
    const digits = f.q.replace(/\D/g, "");
    query = query.or(
      [`name.ilike.${p}`, `business_name.ilike.${p}`, `email.ilike.${p}`, digits.length >= 3 ? `phone_digits.ilike.%${digits}%` : null]
        .filter(Boolean)
        .join(","),
    );
  }
  if (f.status === "open") query = query.not("status", "in", "(converted,lost)");
  else if (f.status && (leadStatus.values as string[]).includes(f.status)) query = query.eq("status", f.status as LeadStatus);
  if (f.source && (leadSource.values as string[]).includes(f.source)) query = query.eq("source", f.source as LeadSource);

  switch (f.sort) {
    case "follow_up":
      query = query.order("follow_up_date", { ascending: true, nullsFirst: false });
      break;
    case "value":
      query = query.order("estimated_value", { ascending: false, nullsFirst: false });
      break;
    case "name":
      query = query.order("name");
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const [from, to] = pageRange(f.page);
  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);
  return { rows: data, total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getLead(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
