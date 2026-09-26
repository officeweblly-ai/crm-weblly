"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const missingEnv = error.message?.includes("environment variable");
  return (
    <div className="mx-auto max-w-md py-16 text-center" role="alert">
      <div className="mx-auto grid size-12 place-items-center rounded-lg border border-danger/20 bg-danger-soft text-danger">
        <TriangleAlert className="size-5" aria-hidden />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-ink">{missingEnv ? "המערכת עוד לא מחוברת ל-Supabase" : "לא הצלחנו לטעון את העמוד"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-3">
        {missingEnv
          ? "חסרים משתני סביבה. העתק את ‎.env.example ל-‎.env.local ומלא את פרטי הפרויקט (ראה README)."
          : "ייתכן שיש בעיית חיבור לשרת. הנתונים שלך לא נפגעו — נסה שוב."}
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-ink-3" dir="ltr">ref: {error.digest}</p>}
      <Button className="mt-6" onClick={() => retry()}>
        <RotateCcw aria-hidden /> ניסיון נוסף
      </Button>
    </div>
  );
}
