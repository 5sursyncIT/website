import historicalCases from "@/content/historical-cases.json";
import { unstable_cache } from "next/cache";
import defaultProjects from "@/content/projects.json";
// Logos and illustrations shipped with the site; uploads use the media collection.
export const builtinLogos: Record<string, { src: string; alt: string }> = {
  "ina-guinee": { src: "/assets/logos/ina-guinee.png", alt: "Logo INA Guinée" },
  "mairie-dakar": { src: "/assets/logos/mairie-dakar.png", alt: "Logo Mairie de Dakar" },
  rtg: { src: "/assets/logos/rtg.png", alt: "Logo RTG" },
  "guce-anapi": { src: "/assets/logos/anapi.svg", alt: "Logo ANAPI" },
  "harmattan-erp": { src: "/assets/logos/harmattan.png", alt: "Logo L’Harmattan Sénégal" },
  cnts: {
    src: "/assets/logos/cnts.png",
    alt: "Logo CNTS — Centre national de transfusion sanguine",
  },
};
export const builtinLogoOptions = [
  { label: "INA Guinée", value: "ina-guinee" },
  { label: "Mairie de Dakar", value: "mairie-dakar" },
  { label: "RTG", value: "rtg" },
  { label: "ANAPI", value: "guce-anapi" },
  { label: "L’Harmattan Sénégal", value: "harmattan-erp" },
  { label: "CNTS", value: "cnts" },
];
export const projectStatuses = [
  { label: "Réalisé", value: "completed" },
  { label: "Sous contrat", value: "contract" },
  { label: "En cours", value: "ongoing" },
  { label: "Pré-lancement", value: "upcoming" },
];
// Crops of the original mockup visual, kept for the two original case studies.
export const builtinIllustrations: Record<
  string,
  { ratio: string; img: Record<string, string> }
> = {
  infrastructure: {
    ratio: "537/294",
    img: {
      width: "190.68901303538175%",
      height: "522.4489795918367%",
      left: "-7.4487895716946%",
      top: "-141.156462585034%",
    },
  },
  web: {
    ratio: "538/308",
    img: {
      width: "190.3345724907063%",
      height: "498.7012987012987%",
      left: "-82.8996282527881%",
      top: "-251.94805194805195%",
    },
  },
};
// Screenshots of delivered sites, keyed by case-study anchor. An image uploaded in
// the CMS still takes precedence.
export const builtinCaseImages: Record<string, { src: string; alt: string }> = {
  harmattan: {
    src: "/assets/realisations/harmattan-senegal.png",
    alt: "Capture d’écran de la page d’accueil du site L’Harmattan Sénégal",
  },
};
export const builtinIllustrationOptions = [
  { label: "Illustration infrastructure (maquette)", value: "infrastructure" },
  { label: "Illustration web (maquette)", value: "web" },
];
type Upload = { filename?: string | null; alt?: string | null } | number | null | undefined;
export type Project = {
  id: string;
  name: string;
  country: string;
  mission: string;
  status: string;
  statusLabel: string;
  logoClass: string;
  logo?: { src: string; alt: string };
};
export type CaseStudy = {
  id: string;
  anchor: string;
  category: string;
  client: string;
  project: string;
  summary: string;
  tags: string[];
  image?: { src: string; alt: string };
  illustration?: string;
};
const statusOf = (label: string) =>
  projectStatuses.find((s) => s.label === label || s.value === label)?.value ??
  "contract";
export const projectSeeds = defaultProjects.map((p, order) => ({
  name: p.name,
  country: p.country,
  mission: p.domain,
  status: statusOf(p.status),
  builtinLogo: builtinLogos[p.key] ? p.key : undefined,
  key: p.key,
  order,
}));
export const caseStudySeeds = [
  {
    anchor: "groupe-hage",
    category: "Infrastructure",
    client: "Groupe Hage",
    project: "Réseau Wi-Fi",
    summary:
      "En juin 2024, au Centre des expositions de Diamniadio : couverture Wi-Fi sur 8 000 m² pour SENFOOD AGRITECH et DAKAR-EXPO, avec interconnexion des stands et zones techniques.",
    tags: ["Réseau", "Connectivité"],
    illustration: "infrastructure",
    order: 0,
  },
  {
    anchor: "harmattan",
    category: "Web",
    client: "Harmattan Sénégal",
    project: "Site vitrine",
    summary:
      "Un projet de présence en ligne pour présenter l’activité et faciliter la prise de contact.",
    tags: ["Web", "Présence en ligne"],
    illustration: "web",
    order: 1,
  },
];
export const mediaURL = (upload: Upload) =>
  upload && typeof upload === "object" && upload.filename
    ? { src: "/media/" + encodeURIComponent(upload.filename), alt: upload.alt || "" }
    : undefined;
const toProject = (p: {
  id: string | number;
  name: string;
  country: string;
  mission: string;
  status: string;
  logo?: Upload;
  builtinLogo?: string | null;
}): Project => ({
  id: String(p.id),
  name: p.name,
  country: p.country,
  mission: p.mission,
  status: p.status,
  statusLabel: projectStatuses.find((s) => s.value === p.status)?.label ?? p.status,
  logoClass: p.builtinLogo ? `project-logo-${p.builtinLogo}` : "",
  logo: mediaURL(p.logo) ?? (p.builtinLogo ? builtinLogos[p.builtinLogo] : undefined),
});
const fallbackProjects = projectSeeds.map((p) => toProject({ ...p, id: p.key }));
const fallbackCaseStudies: CaseStudy[] = [...caseStudySeeds, ...historicalCases].map((c) => ({
  ...c,
  id: c.anchor,
  image: builtinCaseImages[c.anchor],
}));
async function payload() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}
// Build time and database outages fall back to the shipped content.
export async function projects(home = false): Promise<Project[]> {
  if (process.env.BUILD_MODE === "1") return fallbackProjects;
  try {
    return await unstable_cache(
      async () => {
        const result = await (await payload()).find({
          collection: "projects",
          where: {
            published: { equals: true },
            ...(home ? { showOnHome: { equals: true } } : {}),
          },
          sort: "order",
          depth: 1,
          limit: 50,
          overrideAccess: false,
        });
        return result.docs.map(toProject);
      },
      ["projects", String(home)],
      { revalidate: 300, tags: ["showcase"] },
    )();
  } catch {
    return fallbackProjects;
  }
}
export async function caseStudies(): Promise<CaseStudy[]> {
  if (process.env.BUILD_MODE === "1") return fallbackCaseStudies;
  try {
    return await unstable_cache(
      async () => {
        const result = await (await payload()).find({
          collection: "case-studies",
          where: { published: { equals: true } },
          sort: "order",
          depth: 1,
          limit: 20,
          overrideAccess: false,
        });
        return result.docs.map((c) => ({
          id: String(c.id),
          anchor: c.anchor,
          category: c.category || "",
          client: c.client,
          project: c.project,
          summary: c.summary,
          tags: (c.tags || []).map((t) => t.label),
          image: mediaURL(c.image) ?? builtinCaseImages[c.anchor],
          illustration: c.illustration || undefined,
        }));
      },
      ["case-studies"],
      { revalidate: 300, tags: ["showcase"] },
    )();
  } catch {
    return fallbackCaseStudies;
  }
}
// Names of CMS uploads served by /media: letters of any language (uploads such as
// "Douanes_sénégalaises.jpg"), digits, space, _ . -; never a path or a hidden file.
export function isMediaFilename(name: string) {
  return /^[\p{L}\p{M}\p{N}_. -]{1,200}$/u.test(name) && !name.startsWith(".") && !name.includes("..");
}
