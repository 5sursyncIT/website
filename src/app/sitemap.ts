import type { MetadataRoute } from 'next';
import { indexable, publicPaths, canonical } from '@/lib/site-meta';
export default function sitemap(): MetadataRoute.Sitemap {
  return indexable ? publicPaths.map(path => ({ url: canonical(path) })) : [];
}
