import type { MetadataRoute } from 'next';
import { indexable, siteOrigin } from '@/lib/site-meta';
export default function robots(): MetadataRoute.Robots {
  return indexable
    ? { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/support', '/team', '/gestion', '/crm'] }, sitemap: `${siteOrigin}/sitemap.xml` }
    : { rules: { userAgent: '*', disallow: '/' } };
}
