import "server-only";

/**
 * Best-effort preview image for a reference link (og:image / twitter:image).
 * Never throws, gives up after 4 s, reads at most 300 KB, and refuses
 * anything that isn't a public http(s) host — no localhost, IP literals or
 * internal names — so a pasted link can't make the server call inside a network.
 */
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.lan|metadata\..*)$/i;
const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;

function publicUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.port) return null;
    if (BLOCKED_HOST.test(u.hostname) || IP_LITERAL.test(u.hostname) || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

export async function previewImage(pageUrl: string): Promise<string | null> {
  const u = publicUrl(pageUrl);
  if (!u) return null;
  try {
    const res = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; weblly-preview/1.0)", accept: "text/html" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html") || !res.body) return null;
    if (!publicUrl(res.url)) return null;
    const reader = res.body.getReader();
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 300_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    reader.cancel().catch(() => undefined);
    const m =
      /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(html);
    if (!m) return null;
    const img = publicUrl(new URL(m[1].replace(/&amp;/g, "&"), res.url).toString());
    return img && img.protocol === "https:" ? img.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}
