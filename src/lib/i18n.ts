import en from "@/content/en.json";
import type { Locale } from "@/lib/locale";
// English is a translation of the French text actually published, keyed by that text:
// when French copy is edited in the CMS without a matching entry, the English page shows
// the current French rather than an outdated translation.
// Lookups ignore typographic variants a CMS edit may introduce: non-breaking spaces
// (French "?" spacing), repeated spaces and straight or curly apostrophes.
const normalize = (text: string) =>
  text.replace(/[\u00a0\u202f\s]+/g, " ").replace(/'/g, "’").trim();
const dictionary = new Map(Object.entries(en as Record<string, string>).map(([fr, english]) => [normalize(fr), english]));
export function tr(locale: Locale, text: string) {
  if (locale === "fr") return text;
  const core = text.trim();
  const translated = dictionary.get(normalize(core));
  if (!core || translated === undefined) return text;
  // CMS fragments carry their own surrounding spaces (" de votre activité.").
  return text.slice(0, text.indexOf(core)) + translated + text.slice(text.indexOf(core) + core.length);
}
export const hasTranslation = (text: string) => !text.trim() || dictionary.has(normalize(text));
export const translateTexts = (locale: Locale, texts: Record<string, string>) =>
  Object.fromEntries(Object.entries(texts).map(([key, value]) => [key, tr(locale, value)]));
