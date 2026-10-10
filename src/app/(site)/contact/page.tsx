import { pageMetadata } from "@/lib/page-meta";
import Content from "@/content/contact";
import { pageContent } from "@/lib/content";
import { serviceTopic } from "@/lib/contact-topics";
export const revalidate = 300;
export async function generateMetadata() {
  const p = await pageContent("contact");
  return pageMetadata("/contact", p);
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [p, search] = await Promise.all([pageContent("contact"), searchParams]);
  // Arriving from a service page: ?service=<slug> preselects the matching need and is
  // recorded with the request. Unknown values are ignored (serviceTopic returns "").
  const asked = typeof search.service === "string" ? search.service : "";
  const service = serviceTopic(asked) ? asked : "";
  return (
    <Content
      texts={Object.fromEntries((p.texts || []).map((x) => [x.key, x.value]))}
      service={service}
    />
  );
}
