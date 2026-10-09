import type { MetadataRoute } from 'next';
import { indexable, publicPaths, canonical } from '@/lib/site-meta';
import { localePath } from '@/lib/locale';
// Each public page in French and English, each entry naming both versions.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable) return [];
  return publicPaths.flatMap(path => {
    const languages = { fr: canonical(path), en: canonical(localePath('en', path)) };
    return [languages.fr, languages.en].map(url => ({ url, alternates: { languages } }));
  });
}
