import { pageMetadata } from "@/lib/page-meta";
import Content from "@/content/home";
import { pageContent } from "@/lib/content";
import { projects } from "@/lib/showcase";
export const revalidate = 300;
export async function generateMetadata() {
  const p = await pageContent("home");
  return pageMetadata("/", p, "en");
}
export default async function Page() {
  const p = await pageContent("home");
  const projectPage = await pageContent("realisations");
  const cataloguePage = await pageContent("solutions-metier");
  const projectCopy = Object.fromEntries(projectPage.texts.map((x) => [x.key, x.value]));
  return (
    <Content
      locale="en"
      catalogueTexts={Object.fromEntries(cataloguePage.texts.map(x=>[x.key,x.value]))}
      projects={await projects(true)}
      projectsTitle={projectCopy["projects-heading"] ?? "Nos réalisations et projets"}
      texts={Object.fromEntries((p.texts || []).map((x) => [x.key, x.value]))}
    />
  );
}
