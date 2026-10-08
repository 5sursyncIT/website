import { getPayload } from 'payload';
import config from '../src/payload.config';
// Public business number explicitly confirmed by the owner, 6 October 2026.
const url = 'https://wa.me/221770972908';
const payload = await getPayload({ config });
try {
  const global = await payload.findGlobal({ slug: 'social-links', depth: 0 });
  const links = (global.links || []).map(link => ({ ...link }));
  const existing = links.filter(link => link.platform === 'whatsapp');
  if (existing.length === 1 && existing[0].url === url) {
    console.log('WhatsApp: already configured, no change');
  } else {
    const replacement = { ...(existing[0] || {}), platform: 'whatsapp' as const, url };
    const first = links.findIndex(link => link.platform === 'whatsapp');
    const next = links.filter(link => link.platform !== 'whatsapp');
    next.splice(first < 0 ? next.length : first, 0, replacement);
    if (next.length > 8) throw new Error('Social links are full: no unrelated link was removed');
    await payload.updateGlobal({ slug: 'social-links', data: { links: next } });
    console.log('WhatsApp: configured in existing social-links global; unrelated links preserved');
  }
} finally { await payload.destroy(); }
process.exit(0);
