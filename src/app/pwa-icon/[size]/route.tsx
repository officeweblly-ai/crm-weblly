import { appIcon } from "@/lib/app-icon";

const SIZES = new Set([192, 512]);

export async function GET(_req: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return appIcon(size);
}
