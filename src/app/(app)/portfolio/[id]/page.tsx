import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MediaPicker, PortfolioForm } from "@/components/portfolio/portfolio-controls";
import { getPortfolioItem } from "@/lib/data/crm";
import { portfolioStatus, type PortfolioStatus } from "@/lib/domain/labels";
import { requireArea } from "@/lib/auth";

export async function generateMetadata({ params }: PageProps<"/portfolio/[id]">) {
  const { id } = await params;
  const data = await getPortfolioItem(id);
  return { title: data?.item.title ?? "תיק עבודות" };
}

export default async function PortfolioItemPage({ params }: PageProps<"/portfolio/[id]">) {
  await requireArea("social");
  const { id } = await params;
  const data = await getPortfolioItem(id);
  if (!data) notFound();
  const { item, images } = data;
  const used = images.filter((f) => f.portfolioKind).length;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-sm text-ink-3">
        <Link href="/portfolio" className="inline-flex items-center gap-1 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden />
          תיק עבודות
        </Link>
      </div>
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{item.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-3">
            <Badge tone={portfolioStatus.tone(item.status as PortfolioStatus)}>{portfolioStatus.label(item.status as PortfolioStatus)}</Badge>
            {item.projects && (
              <Link href={`/projects/${item.projects.id}`} className="hover:text-accent">פרויקט: {item.projects.name}</Link>
            )}
            {item.site_url && (
              <a href={item.site_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                לאתר <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="order-2 lg:order-1">
          <CardHeader title="תמונות" description={`${used} נבחרו · Cover, צילומי דסקטופ ומובייל, לפני/אחרי`} />
          <CardBody>
            <MediaPicker itemId={item.id} projectId={item.project_id} clientId={item.projects?.client_id ?? item.client_id} images={images} />
          </CardBody>
        </Card>
        <Card className="order-1 lg:order-2">
          <CardHeader title="פרטים" />
          <CardBody>
            <PortfolioForm item={item} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
