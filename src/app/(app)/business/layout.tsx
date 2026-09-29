import { BusinessTabs } from "@/components/business/business-tabs";
import { requireStaff } from "@/lib/auth";

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  const allowed = viewer.access.all ? ("all" as const) : [...viewer.access.allowed];
  return (
    <>
      <div className="mb-3 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ניהול העסק</h1>
        <p className="mt-1 text-sm text-ink-3">רווח והפסד, יעדים, אסטרטגיה, הוצאות והסכם השותפים — במקום אחד.</p>
      </div>
      <BusinessTabs allowed={allowed} />
      {children}
    </>
  );
}
