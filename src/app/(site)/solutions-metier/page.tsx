import { pageMetadata } from "@/lib/page-meta";
import Content from "@/content/solutions-metier";
import { pageContent } from "@/lib/content";
export const revalidate = 300;
export async function generateMetadata() {
  const p = await pageContent("solutions-metier");
  return pageMetadata("/solutions-metier", p);
}
export default async function Page() {
  const p = await pageContent("solutions-metier");
  return (
    <Content
      texts={Object.fromEntries((p.texts || []).map((x) => [x.key, x.value]))}
    />
  );
}
