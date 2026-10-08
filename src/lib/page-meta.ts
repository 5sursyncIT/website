import type { Metadata } from "next";
import { canonical } from "@/lib/site-meta";

// Search/share descriptions per public page; a CMS copy key "meta-description" overrides them.
const descriptions: Record<string, string> = {
  "/": "5/Sync IT, entreprise informatique à Dakar : réseaux et cloud, solutions métier (ERP, GED), développement et API, maintenance et support pour entreprises et institutions.",
  "/services": "Réseaux et cloud, solutions métier, développement et API, maintenance et support : les quatre expertises de 5/Sync IT à Dakar pour connecter vos équipes et structurer vos outils.",
  "/reseaux-cloud": "Réseaux d’entreprise, Wi-Fi, serveurs et cloud à Dakar : 5/Sync IT conçoit une infrastructure pensée pour vos usages et votre organisation.",
  "/solutions-metier": "Ventes, achats, stocks, facturation, gestion documentaire : des solutions métier adaptées à votre organisation avec les gammes 5/Sync IT.",
  "/developpement-api": "Applications web, API et connexion de vos données : 5/Sync IT développe à Dakar les outils qui relient vos services, votre CRM et vos usages.",
  "/maintenance-support": "Maintenance informatique et support utilisateurs à Dakar : traitement des incidents, suivi clair et planification de la maintenance avec 5/Sync IT.",
  "/realisations": "Réalisations de 5/Sync IT pour des institutions et entreprises en Afrique de l’Ouest et centrale : infrastructure, réseaux, développement et solutions métier.",
  "/a-propos": "5/Sync IT accompagne depuis Dakar les entreprises et institutions dans leurs projets informatiques : réseaux, outils métier, développement et support.",
  "/mentions-legales": "Mentions légales de 5/Sync IT, SUARL à Dakar : éditeur, RCCM, NINEA, directeur de la publication et hébergeur du site.",
  "/politique-de-confidentialite": "Comment 5/Sync IT collecte, utilise et protège vos données personnelles, et comment exercer vos droits selon la loi sénégalaise 2008-12.",
  "/contact": "Contactez 5/Sync IT à Keur Massar (Dakar) par téléphone, WhatsApp, e-mail ou formulaire pour présenter votre projet informatique.",
};

// Next replaces (does not merge) openGraph/twitter per page, so shared fields live here.
const shareImage = { url: "/assets/og-5sursync.jpg", width: 1200, height: 630, alt: "5/Sync IT" };
export const openGraphBase = { type: "website" as const, locale: "fr_SN", siteName: "5/Sync IT", images: [shareImage] };
export const twitterBase = { card: "summary_large_image" as const, images: [shareImage.url] };

// Avoid "À propos de 5/Sync IT | 5/Sync IT" when the CMS title already names the brand.
function cleanTitle(title: string) {
  const suffix = " | 5/Sync IT";
  return title.endsWith(suffix) && title.slice(0, -suffix.length).includes("5/Sync IT")
    ? title.slice(0, -suffix.length)
    : title;
}

export function pageMetadata(
  path: string,
  page: { title: string; texts?: { key: string; value: string }[] },
): Metadata {
  const title = cleanTitle(page.title);
  const override = page.texts?.find((x) => x.key === "meta-description")?.value?.trim();
  const description = override || descriptions[path];
  const url = canonical(path);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { ...openGraphBase, title, description, url },
    twitter: { ...twitterBase, title, description },
  };
}
