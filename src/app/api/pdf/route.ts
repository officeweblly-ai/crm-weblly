import { NextResponse, type NextRequest } from "next/server";
import { areaForPath } from "@/lib/domain/permissions";
import { renderPdf } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Real PDF download: renders one of our own pages in headless Chrome with the
 * print stylesheet and returns the file. Works everywhere — including the
 * installed iPhone app, where window.print() does nothing.
 *
 * Only these pages can be rendered (no open proxy / SSRF):
 */
const STAFF_PATHS = [
  /^\/proposals\/[0-9a-f-]{36}$/,
  /^\/contracts\/[0-9a-f-]{36}$/,
  /^\/contracts\/[0-9a-f-]{36}\/signed$/,
];
// Token pages: proposal, client contract, partnership agreement.
const PUBLIC_PATHS = [/^\/o\/[A-Za-z0-9_-]{43}$/, /^\/s\/[A-Za-z0-9_-]{43}$/, /^\/agreement\/[A-Za-z0-9_-]{43}$/];

function safeName(name: string | null) {
  const n = (name ?? "document").replace(/[\\/:*?"<>|\n\r]+/g, " ").trim().slice(0, 120) || "document";
  return n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`;
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const version = req.nextUrl.searchParams.get("v");
  const isStaff = STAFF_PATHS.some((r) => r.test(path));
  const isPublic = PUBLIC_PATHS.some((r) => r.test(path));
  if (!isStaff && !isPublic) return NextResponse.json({ error: "לא ניתן להפיק PDF לעמוד הזה." }, { status: 400 });

  if (isStaff) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) return NextResponse.json({ error: "צריך להתחבר." }, { status: 401 });
    const { data: staff } = await supabase.rpc("is_staff");
    if (!staff) return NextResponse.json({ error: "אין הרשאה." }, { status: 403 });
    const area = areaForPath(path);
    if (area) {
      const { data: allowed } = await supabase.rpc("has_permission", { p_area: area });
      if (!allowed) return NextResponse.json({ error: "התפקיד שלך לא כולל את האזור הזה." }, { status: 403 });
    }
  }

  const origin = req.nextUrl.origin;
  const target = new URL(path, origin);
  if (version && /^\d{1,4}$/.test(version)) target.searchParams.set("v", version);

  try {
    const pdf = await renderPdf(target, { cookies: isStaff ? req.cookies.getAll() : [] });
    const name = safeName(req.nextUrl.searchParams.get("name"));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[pdf]", (e as Error).message);
    return NextResponse.json({ error: "הפקת ה-PDF נכשלה. אפשר לנסות שוב, או להשתמש בהדפסה." }, { status: 500 });
  }
}
