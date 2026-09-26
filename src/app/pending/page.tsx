import { Clock } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export const metadata = { title: "ממתין לאישור" };

export default function PendingPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-lg border border-line bg-surface text-ink-3">
          <Clock className="size-5" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-ink">החשבון ממתין לאישור</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">
          נכנסת בהצלחה, אבל בעל המערכת עוד לא הפעיל את המשתמש שלך. אחרי ההפעלה בעמוד ההגדרות תוכל להיכנס כרגיל.
        </p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="secondary">
            התנתקות
          </Button>
        </form>
      </div>
    </main>
  );
}
