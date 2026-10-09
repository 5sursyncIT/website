import type { Metadata } from "next";
import { canonical } from "@/lib/site-meta";
import { type Locale, localePath } from "@/lib/locale";
import { tr } from "@/lib/i18n";

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
// Same pages in English, keyed by the French path.
const englishDescriptions: Record<string, string> = {
  "/": "5/Sync IT, an IT company in Dakar, Senegal: networks and cloud, business solutions (ERP, document management), development and APIs, maintenance and support for businesses and institutions.",
  "/services": "Networks and cloud, business solutions, development and APIs, maintenance and support: the four areas of expertise of 5/Sync IT in Dakar to connect your teams and structure your tools.",
  "/reseaux-cloud": "Business networks, Wi-Fi, servers and cloud in Dakar: 5/Sync IT designs infrastructure built around how you work and how you are organised.",
  "/solutions-metier": "Sales, purchasing, inventory, invoicing, document management: business solutions tailored to your organisation with the 5/Sync IT product ranges.",
  "/developpement-api": "Web applications, APIs and data integration: in Dakar, 5/Sync IT builds the tools that connect your departments, your CRM and your day-to-day work.",
  "/maintenance-support": "IT maintenance and user support in Dakar: incident handling, clear follow-up and planned maintenance with 5/Sync IT.",
  "/realisations": "Projects delivered by 5/Sync IT for institutions and businesses in West and Central Africa: infrastructure, networks, development and business solutions.",
  "/a-propos": "From Dakar, 5/Sync IT supports businesses and institutions with their IT projects: networks, business software, development and support.",
  "/mentions-legales": "Legal notice of 5/Sync IT, a single-member limited company (SUARL) in Dakar: publisher, trade register, tax ID, publication director and hosting provider.",
  "/politique-de-confidentialite": "How 5/Sync IT collects, uses and protects your personal data, and how to exercise your rights under Senegalese law 2008-12.",
  "/contact": "Contact 5/Sync IT in Keur Massar (Dakar) by phone, WhatsApp, email or form to tell us about your IT project.",
};

// Next replaces (does not merge) openGraph/twitter per page, so shared fields live here.
const shareImage = { url: "/assets/og-5sursync.jpg", width: 1200, height: 630, alt: "5/Sync IT" };
export const openGraphBase = { type: "website" as const, locale: "fr_SN", siteName: "5/Sync IT", images: [shareImage] };
const ogLocales = { fr: { locale: "fr_SN", alternateLocale: ["en_GB"] }, en: { locale: "en_GB", alternateLocale: ["fr_SN"] } };
export const twitterBase = { card: "summary_large_image" as const, images: [shareImage.url] };

// Avoid "À propos de 5/Sync IT | 5/Sync IT" when the CMS title already names the brand.
function cleanTitle(title: string) {
  const suffix = " | 5/Sync IT";
  return title.endsWith(suffix) && title.slice(0, -suffix.length).includes("5/Sync IT")
    ? title.slice(0, -suffix.length)
    : title;
}

/** `path` is always the French path; English pages pass locale "en". */
export function pageMetadata(
  path: string,
  page: { title: string; texts?: { key: string; value: string }[] },
  locale: Locale = "fr",
): Metadata {
  const title = cleanTitle(tr(locale, page.title));
  const override = page.texts?.find((x) => x.key === "meta-description")?.value?.trim();
  // An untranslated CMS override would put French text on an English page.
  const translated = override && tr(locale, override);
  const description =
    locale === "en"
      ? (translated && translated !== override ? translated : englishDescriptions[path])
      : override || descriptions[path];
  const url = canonical(localePath(locale, path));
  const languages = {
    fr: canonical(path),
    en: canonical(localePath("en", path)),
    "x-default": canonical(path),
  };
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url, languages },
    openGraph: { ...openGraphBase, ...ogLocales[locale], title, description, url },
    twitter: { ...twitterBase, title, description },
  };
}
