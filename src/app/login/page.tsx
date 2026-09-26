import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "התחברות" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span className="grid size-10 place-items-center rounded-lg bg-ink font-display text-lg font-bold text-white" aria-hidden>
            ס
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold text-ink">כניסה למערכת</h1>
          <p className="mt-2 text-sm text-ink-3">לידים, לקוחות, פרויקטים ותשלומים — במקום אחד.</p>
        </div>
        <LoginForm next={typeof next === "string" ? next : "/"} />
        <p className="mt-6 text-xs leading-relaxed text-ink-3">
          המערכת פנימית. משתמשים חדשים נוספים על ידי בעל החשבון דרך Supabase ומאושרים בעמוד ההגדרות.
        </p>
      </div>
    </main>
  );
}
