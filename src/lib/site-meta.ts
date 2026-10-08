export const siteOrigin = process.env.SITE_ORIGIN || process.env.APP_ORIGIN || 'https://preprod.5sursync.com';
if (!['https://5sursync.com', 'https://preprod.5sursync.com'].includes(siteOrigin)) {
  throw new Error('SITE_ORIGIN must be an approved HTTPS origin');
}
export const indexable = process.env.SITE_INDEXABLE === '1' && siteOrigin === 'https://5sursync.com';
export const publicPaths = ['/', '/services', '/reseaux-cloud', '/solutions-metier', '/developpement-api', '/maintenance-support', '/realisations', '/a-propos', '/contact', '/mentions-legales', '/politique-de-confidentialite'] as const;
export function canonical(path: string) { return new URL(path, siteOrigin).toString(); }
