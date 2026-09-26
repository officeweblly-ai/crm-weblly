import { Files } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { FileGrid } from "@/components/files/file-list";
import { listFiles, withThumbs } from "@/lib/data/crm";
import { fileCategory } from "@/lib/domain/labels";
import { first, parsePage } from "@/lib/utils";

export const metadata = { title: "קבצים" };

export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const sp = await searchParams;
  const f = { q: first(sp.q), category: first(sp.category), page: parsePage(sp.page) };
  const { rows, total } = await listFiles(f);
  const files = await withThumbs(rows);
  const hrefFor = (page: number) => `/files?${new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <PageHeader title="קבצים" description="כל הקבצים של כל הלקוחות. להעלאה — נכנסים לתיק הלקוח או לפרויקט." />
      <ListToolbar searchPlaceholder="חיפוש לפי שם קובץ" filters={[{ name: "category", label: "קטגוריה", options: fileCategory.list }]} />
      {files.length ? (
        <>
          <FileGrid files={files} showContext />
          <Pagination page={f.page} total={total} pageSize={30} hrefFor={hrefFor} />
        </>
      ) : (
        <Card>
          <EmptyState
            icon={Files}
            title={f.q || f.category ? "לא נמצאו קבצים" : "עוד אין קבצים"}
            description={f.q || f.category ? "נסה חיפוש או קטגוריה אחרת." : "לוגואים, תמונות וחומרים שהלקוחות מעלים בשאלון, וקבצים שאתה מעלה לתיק — יופיעו כאן."}
          />
        </Card>
      )}
    </>
  );
}
