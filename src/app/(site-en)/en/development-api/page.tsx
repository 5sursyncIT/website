import { pageMetadata } from "@/lib/page-meta";
import Content from "@/content/developpement-api";
import { pageContent } from "@/lib/content";
export const revalidate = 300;
export async function generateMetadata() {
  const p = await pageContent("developpement-api");
  return pageMetadata("/developpement-api", p, "en");
}
export default async function Page() {
  const p = await pageContent("developpement-api");
  return (
    <Content
      locale="en"
      texts={Object.fromEntries((p.texts || []).map((x) => [x.key, x.value]))}
    />
  );
}
