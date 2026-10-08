import { getPayload } from "payload";
import config from "../src/payload.config";
import pages from "../src/content/defaults.json";
import { caseStudySeeds, projectSeeds, projectStatuses } from "../src/lib/showcase";
const payload = await getPayload({ config });
for (const page of pages) {
  const existing = await payload.find({
    collection: "pages",
    where: { slug: { equals: page.slug } },
    limit: 1,
  });
  const record = existing.docs[0];
  if (!record) {
    await payload.create({
      collection: "pages",
      data: { slug: page.slug, title: page.title, copy: page.texts },
    });
    continue;
  }
  // New template keys are appended; texts already edited in the CMS are never overwritten.
  const copy = (record.copy || []).map(({ key, value }) => ({ key, value }));
  const missing = page.texts.filter((t) => !copy.some((c) => c.key === t.key));
  if (missing.length) {
    await payload.update({
      collection: "pages",
      id: record.id,
      data: { copy: [...copy, ...missing] },
    });
    console.log(`${page.slug}: ${missing.length} clé(s) ajoutée(s)`);
  }
}
// Showcase: created once from the current page copy (keeps CMS edits), then the
// old per-key copy is removed from the realisations page.
const realisations = (
  await payload.find({ collection: "pages", where: { slug: { equals: "realisations" } }, limit: 1 })
).docs[0];
const copy = Object.fromEntries((realisations?.copy || []).map((c) => [c.key, c.value]));
if ((await payload.count({ collection: "projects" })).totalDocs === 0) {
  for (const seed of projectSeeds) {
    const field = (name: string) => copy[`project-${seed.key}-${name}`];
    const statusLabel = field("status");
    await payload.create({
      collection: "projects",
      data: {
        name: field("name") ?? seed.name,
        country: field("country") ?? seed.country,
        mission: field("domain") ?? seed.mission,
        status: (projectStatuses.find((s) => s.label === statusLabel)?.value ??
          seed.status) as "completed",
        builtinLogo: seed.builtinLogo as "rtg" | undefined,
        order: seed.order,
        published: true,
        showOnHome: true,
      },
    });
  }
  console.log(`projects: ${projectSeeds.length} créés`);
}
if ((await payload.count({ collection: "case-studies" })).totalDocs === 0) {
  // Former template keys: text-6..11 (first case study), text-12..17 (second).
  for (const [index, seed] of caseStudySeeds.entries()) {
    const base = 6 + index * 6;
    const v = (offset: number, fallback: string) => copy[`text-${base + offset}`] ?? fallback;
    await payload.create({
      collection: "case-studies",
      data: {
        anchor: seed.anchor,
        category: v(0, seed.category),
        client: v(1, seed.client),
        project: v(2, seed.project),
        summary: v(3, seed.summary),
        tags: [v(4, seed.tags[0]), v(5, seed.tags[1])].map((label) => ({ label })),
        illustration: seed.illustration as "web",
        order: seed.order,
        published: true,
      },
    });
  }
  console.log(`case-studies: ${caseStudySeeds.length} créées`);
}
const obsolete = (key: string) =>
  key.startsWith("project-") || /^text-(5|6|7|8|9|1[0-8])$/.test(key);
if (realisations && (realisations.copy || []).some((c) => obsolete(c.key))) {
  const kept = (realisations.copy || [])
    .filter((c) => !obsolete(c.key))
    .map(({ key, value }) => ({ key, value }));
  await payload.update({ collection: "pages", id: realisations.id, data: { copy: kept } });
  console.log(`realisations: ${(realisations.copy || []).length - kept.length} anciennes clés retirées`);
}
await payload.destroy();

// Next cache helpers may keep timers open outside a server; this is a one-shot CLI.
process.exit(0);
