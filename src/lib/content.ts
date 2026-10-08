import defaults from "@/content/defaults.json";
import { unstable_cache } from "next/cache";
export const pageSlugs = defaults.map((p) => p.slug);
export async function pageContent(slug: string) {
  const base = defaults.find((p) => p.slug === slug)!;
  if (process.env.BUILD_MODE === "1") return base;
  return unstable_cache(
    async () => {
      const { getPayload } = await import("payload");
      const { default: config } = await import("@payload-config");
      const payload = await getPayload({ config });
      const result = await payload.find({
        collection: "pages",
        where: { slug: { equals: slug } },
        limit: 1,
        overrideAccess: false,
        depth: 0,
      });
      const page = result.docs[0];
      return page
        ? {
            ...base,
            title: String(page.title),
            texts: page.copy as { key: string; value: string }[],
          }
        : base;
    },
    ["page", slug],
    { revalidate: 300, tags: ["pages"] },
  )();
}
