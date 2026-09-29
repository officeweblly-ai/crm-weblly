import { NextResponse, type NextRequest } from "next/server";
import { areaForPath } from "@/lib/domain/permissions";
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
  /^\/business\/partners$/,
];
const PUBLIC_PATHS = [/^\/o\/[A-Za-z0-9_-]{43}$/, /^\/s\/[A-Za-z0-9_-]{43}$/];

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 1200, height: 1600 },
    });
  }
  // Local development: the installed Chrome.
  const local =
    process.env.CHROME_PATH ??
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : "/usr/bin/google-chrome");
  return puppeteer.launch({ executablePath: local, headless: true, defaultViewport: { width: 1200, height: 1600 } });
}

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

  let browser: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage();
    if (isStaff) {
      // The signed-in person's own session, only toward our own origin.
      const host = req.nextUrl.hostname;
      const secure = req.nextUrl.protocol === "https:";
      const cookies = req.cookies.getAll().map((c) => ({ name: c.name, value: c.value, domain: host, path: "/", secure, httpOnly: true, sameSite: "Lax" as const }));
      if (cookies.length) await browser.setCookie(...cookies);
    }
    await page.emulateMediaType("print");
    const res = await page.goto(target.toString(), { waitUntil: "networkidle0", timeout: 45_000 });
    if (!res || !res.ok()) throw new Error(`page status ${res?.status()}`);
    // Streaming: wait until no loading skeleton is left, and fonts are ready.
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 20_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const name = safeName(req.nextUrl.searchParams.get("name"));
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[pdf]", (e as Error).message);
    return NextResponse.json({ error: "הפקת ה-PDF נכשלה. אפשר לנסות שוב, או להשתמש בהדפסה." }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
