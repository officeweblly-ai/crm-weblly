import { Link2Off } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export function InvalidLink({ title = "הקישור לא פעיל", text = "ייתכן שהקישור הוחלף בקישור חדש או שהועתק באופן חלקי. בקשו מאיתנו את הקישור העדכני." }: { title?: string; text?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-5">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-line bg-surface">
          <Link2Off className="size-5 text-ink-3" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">{text}</p>
        <div className="mt-8 flex justify-center">
          <Logo size="sm" />
        </div>
      </div>
    </main>
  );
}
