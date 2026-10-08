import { pageMetadata } from "@/lib/page-meta";
import Content from "@/content/reseaux-cloud";
import { pageContent } from "@/lib/content";
export const revalidate = 300;
export async function generateMetadata() {
  const p = await pageContent("reseaux-cloud");
  return pageMetadata("/reseaux-cloud", p);
}
export default async function Page() {
  const p = await pageContent("reseaux-cloud");
  return (
    <Content
      texts={Object.fromEntries((p.texts || []).map((x) => [x.key, x.value]))}
    />
  );
}
