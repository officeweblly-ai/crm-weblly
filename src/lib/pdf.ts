import "server-only";

/**
 * Renders one of our own pages to an A4 PDF in headless Chrome, with the print
 * stylesheet (including @page margin boxes: running header/footer and page
 * numbers). Used by /api/pdf (downloads) and to store final signed copies.
 */
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

export type PdfCookie = { name: string; value: string };

export async function renderPdf(url: URL, opts: { cookies?: PdfCookie[] } = {}): Promise<Buffer> {
  let browser: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage();
    if (opts.cookies?.length) {
      // The signed-in person's own session, only toward our own origin.
      const secure = url.protocol === "https:";
      await browser.setCookie(...opts.cookies.map((c) => ({ name: c.name, value: c.value, domain: url.hostname, path: "/", secure, httpOnly: true, sameSite: "Lax" as const })));
    }
    await page.emulateMediaType("print");
    const res = await page.goto(url.toString(), { waitUntil: "networkidle0", timeout: 45_000 });
    if (!res || !res.ok()) throw new Error(`page status ${res?.status()}`);
    // Streaming: wait until no loading skeleton is left, and fonts are ready.
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 20_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser?.close().catch(() => {});
  }
}
