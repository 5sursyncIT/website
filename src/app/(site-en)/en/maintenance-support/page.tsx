import { pageMetadata } from "@/lib/page-meta";
import Content from "@/content/maintenance-support";
import { pageContent } from "@/lib/content";
import { casesForService } from "@/lib/showcase";
export const revalidate = 300;
export async function generateMetadata() {
  const p = await pageContent("maintenance-support");
  return pageMetadata("/maintenance-support", p, "en");
}
export default async function Page() {
  const [p, cases] = await Promise.all([pageContent("maintenance-support"), casesForService("maintenance-support")]);
  return (
    <Content
      locale="en"
      texts={Object.fromEntries((p.texts || []).map((x) => [x.key, x.value]))}
      cases={cases}
    />
  );
}
