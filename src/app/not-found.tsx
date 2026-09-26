import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4">
      <div className="max-w-sm text-center">
        <p className="font-display text-5xl font-bold text-line-strong num">404</p>
        <h1 className="mt-3 text-xl font-semibold text-ink">הדף לא נמצא</h1>
        <p className="mt-2 text-sm text-ink-3">ייתכן שהרשומה נמחקה, או שהקישור שגוי.</p>
        <Button asChild className="mt-6">
          <Link href="/">חזרה לדשבורד</Link>
        </Button>
      </div>
    </main>
  );
}
