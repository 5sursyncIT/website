import { pageMetadata } from "@/lib/page-meta";
import Content from "@/content/realisations";
import { pageContent } from "@/lib/content";
import { caseStudies, projects } from "@/lib/showcase";
export const revalidate = 300;
export async function generateMetadata() {
  const p = await pageContent("realisations");
  return pageMetadata("/realisations", p);
}
export default async function Page() {
  const p = await pageContent("realisations");
  const texts = Object.fromEntries((p.texts || []).map((x) => [x.key, x.value]));
  return (
    <Content
      projects={await projects()}
      caseStudies={await caseStudies()}
      projectsTitle={texts["projects-heading"] ?? "Nos réalisations et projets"}
      texts={texts}
    />
  );
}
