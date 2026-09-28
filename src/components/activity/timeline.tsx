import Link from "next/link";
import {
  Activity,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileUp,
  FolderKanban,
  Inbox,
  ListChecks,
  MessagesSquare,
  PhoneCall,
  ReceiptText,
  Stamp,
  BriefcaseBusiness,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ActivityRow } from "@/lib/data/crm";
import { formatDateTime, formatDay, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

function iconFor(type: string): { icon: LucideIcon; cls: string } {
  if (type.startsWith("payment")) return { icon: CircleDollarSign, cls: "text-ok bg-ok-soft" };
  if (type === "questionnaire.submitted") return { icon: ClipboardCheck, cls: "text-accent bg-accent-soft" };
  if (type.startsWith("questionnaire")) return { icon: ClipboardList, cls: "text-info bg-info-soft" };
  if (type.startsWith("file")) return { icon: FileUp, cls: "text-ink-2 bg-sunken" };
  if (type === "contract.signed_digitally") return { icon: FileSignature, cls: "text-ok bg-ok-soft" };
  if (type.startsWith("contract")) return { icon: FileSignature, cls: "text-ink-2 bg-sunken" };
  if (type === "proposal.accepted") return { icon: ReceiptText, cls: "text-ok bg-ok-soft" };
  if (type.startsWith("proposal")) return { icon: ReceiptText, cls: "text-info bg-info-soft" };
  if (type.startsWith("interaction")) return { icon: MessagesSquare, cls: "text-accent bg-accent-soft" };
  if (type.startsWith("followup")) return { icon: PhoneCall, cls: "text-accent bg-accent-soft" };
  if (type.startsWith("approval")) return { icon: Stamp, cls: "text-warn bg-warn-soft" };
  if (type.startsWith("portfolio")) return { icon: BriefcaseBusiness, cls: "text-ink-2 bg-sunken" };
  if (type.startsWith("task")) return { icon: ListChecks, cls: "text-ink-2 bg-sunken" };
  if (type.startsWith("project")) return { icon: FolderKanban, cls: "text-accent bg-accent-soft" };
  if (type.startsWith("lead")) return { icon: Inbox, cls: "text-warn bg-warn-soft" };
  if (type.startsWith("client")) return { icon: UserPlus, cls: "text-ink-2 bg-sunken" };
  return { icon: Activity, cls: "text-ink-2 bg-sunken" };
}

/** Chronological activity, grouped by day. */
export function Timeline({ items, showContext = false, compact = false }: { items: ActivityRow[]; showContext?: boolean; compact?: boolean }) {
  const groups: { day: string; items: ActivityRow[] }[] = [];
  for (const it of items) {
    const day = formatDay(it.created_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(it);
    else groups.push({ day, items: [it] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.day}>
          {!compact && <h3 className="mb-2 text-xs font-medium text-ink-3">{g.day}</h3>}
          <ol className="relative flex flex-col">
            {g.items.map((it, i) => {
              const { icon: Icon, cls } = iconFor(it.type);
              const last = i === g.items.length - 1;
              return (
                <li key={it.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {!last && <span className="absolute start-[15px] top-8 bottom-0 w-px bg-line" aria-hidden />}
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", cls)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm text-ink">{it.description}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      <time dateTime={it.created_at} title={formatDateTime(it.created_at)}>
                        {timeAgo(it.created_at)}
                      </time>
                      {it.profiles ? ` · ${it.profiles.full_name || it.profiles.email}` : it.type.startsWith("questionnaire") || it.type.endsWith("from_questionnaire") ? " · הלקוח" : ""}
                      {showContext && it.clients && (
                        <>
                          {" · "}
                          <Link href={`/clients/${it.clients.id}`} className="hover:text-accent">
                            {it.clients.name}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
