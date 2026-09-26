import Link from "next/link";
import { FolderKanban, Inbox, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Ltr, PageHeader } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/server";
import { clientStatus, leadStatus, projectStatus } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/format";
import { first, searchPattern } from "@/lib/utils";

export const metadata = { title: "חיפוש" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const q = (first((await searchParams).q) ?? "").trim();
  if (!q) return <><PageHeader title="חיפוש" /><Card><EmptyState icon={Search} title="מה מחפשים?" description="שם, עסק, טלפון, אימייל או שם פרויקט." /></Card></>;

  const supabase = await createClient();
  const p = searchPattern(q);
  const digits = q.replace(/\D/g, "");
  const people = [`name.ilike.${p}`, `business_name.ilike.${p}`, `email.ilike.${p}`, digits.length >= 3 ? `phone_digits.ilike.%${digits}%` : null].filter(Boolean).join(",");
  const [{ data: clients }, { data: projects }, { data: leads }] = await Promise.all([
    supabase.from("clients").select("id, name, business_name, phone, email, status").or(people).order("updated_at", { ascending: false }).limit(20),
    supabase.from("projects").select("id, name, status, clients!inner(id, name, business_name)").or(`name.ilike.${p}`).order("updated_at", { ascending: false }).limit(20),
    supabase.from("leads").select("id, name, business_name, phone, status").or(people).neq("status", "converted").order("created_at", { ascending: false }).limit(10),
  ]);
  // Projects whose client matches the search, too.
  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: clientProjects } = clientIds.length ? await supabase.from("projects").select("id, name, status, clients!inner(id, name, business_name)").in("client_id", clientIds).limit(20) : { data: [] };
  const allProjects = [...(projects ?? []), ...(clientProjects ?? []).filter((cp) => !(projects ?? []).some((pp) => pp.id === cp.id))];
  const total = (clients?.length ?? 0) + allProjects.length + (leads?.length ?? 0);

  return (
    <>
      <PageHeader title={<>תוצאות עבור &quot;{q}&quot;</>} description={`${total} תוצאות`} />
      {total === 0 ? (
        <Card><EmptyState icon={Search} title="לא נמצא דבר" description="נסה חלק מהשם, או מספר טלפון בלי מקפים." /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {!!clients?.length && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><Users className="size-4 text-ink-3" aria-hidden />לקוחות</span>} />
              <ul className="divide-y divide-line">
                {clients.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {[c.business_name, c.phone ? formatPhone(c.phone) : null].filter(Boolean).join(" · ")}
                          {c.email && <> · <Ltr>{c.email}</Ltr></>}
                        </span>
                      </span>
                      <Badge tone={clientStatus.tone(c.status)}>{clientStatus.label(c.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {allProjects.length > 0 && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><FolderKanban className="size-4 text-ink-3" aria-hidden />פרויקטים</span>} />
              <ul className="divide-y divide-line">
                {allProjects.map((pr) => (
                  <li key={pr.id}>
                    <Link href={`/projects/${pr.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{pr.name}</span>
                        <span className="block truncate text-xs text-ink-3">{pr.clients?.business_name ?? pr.clients?.name}</span>
                      </span>
                      <Badge tone={projectStatus.tone(pr.status)}>{projectStatus.label(pr.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!!leads?.length && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><Inbox className="size-4 text-ink-3" aria-hidden />לידים</span>} />
              <ul className="divide-y divide-line">
                {leads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{l.name}</span>
                        <span className="block truncate text-xs text-ink-3">{[l.business_name, l.phone ? formatPhone(l.phone) : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      <Badge tone={leadStatus.tone(l.status)}>{leadStatus.label(l.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
