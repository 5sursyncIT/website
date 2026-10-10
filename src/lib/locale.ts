// French is the primary language at the site root; English pages live under /en with
// English slugs. Safe for client components: no dictionary imported here.
export type Locale = "fr" | "en";
export const enPaths: Record<string, string> = {
  "/": "/en",
  "/services": "/en/services",
  "/reseaux-cloud": "/en/networks-cloud",
  "/solutions-metier": "/en/business-solutions",
  "/developpement-api": "/en/development-api",
  "/maintenance-support": "/en/maintenance-support",
  "/realisations": "/en/projects",
  "/a-propos": "/en/about",
  "/contact": "/en/contact",
  "/mentions-legales": "/en/legal-notice",
  "/politique-de-confidentialite": "/en/privacy-policy",
};
const frPaths = Object.fromEntries(Object.entries(enPaths).map(([fr, en]) => [en, fr]));
export const localeOf = (pathname: string): Locale =>
  pathname === "/en" || pathname.startsWith("/en/") ? "en" : "fr";
/** Localised href for a French site path, keeping any ?query and #anchor.
 *  Unknown paths (Support) stay as is. The query matters for /contact?service=…,
 *  so it is split off before the lookup instead of defeating it. */
export function localePath(locale: Locale, path: string) {
  if (locale === "fr") return path;
  const [withoutHash, hash] = path.split("#");
  const [base, query] = withoutHash.split("?");
  const target = enPaths[base] ?? base;
  return `${target}${query ? `?${query}` : ""}${hash === undefined ? "" : `#${hash}`}`;
}
/** Same page in the other language; the home page of that language when there is no match. */
export function switchPath(pathname: string): string {
  if (localeOf(pathname) === "en") return frPaths[pathname] ?? "/";
  return enPaths[pathname] ?? "/en";
}
