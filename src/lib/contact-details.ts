import { pageContent } from './content';
import { telHref } from './phone';
export const CONTACT_DEFAULTS={email:'contact@5sursync.com',address:"Almadie 2, Résidence El'hadji Oumar Dieng, 4ème A, Sénégal",phone:'+221 77 097 29 08',landline:'+221 33 805 79 09',mobile:'+221 76 881 30 39'};
export const CONTACT_MAP_POINT = { latitude: '14.7542504016923', longitude: '-17.282571650958925' } as const;
export function contactFromCopy(texts:Record<string,string>) {
  const rawEmail=texts['text-8']??'';
  const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)?rawEmail:CONTACT_DEFAULTS.email;
  const rawAddress=texts['text-9']?.trim();
  const address=rawAddress&&rawAddress!=='Dakar, Sénégal'?rawAddress:CONTACT_DEFAULTS.address;
  const displays=[texts['phone']||CONTACT_DEFAULTS.phone,texts['phone-landline']||CONTACT_DEFAULTS.landline,texts['phone-mobile']||CONTACT_DEFAULTS.mobile];
  const phones=displays.map(display=>({display,href:telHref(display)}));
  const encoded=encodeURIComponent(`${CONTACT_MAP_POINT.latitude},${CONTACT_MAP_POINT.longitude}`);
  return {email,address,phones,mapEmbed:`https://www.google.com/maps?q=${encoded}&output=embed`,mapSearch:`https://www.google.com/maps/search/?api=1&query=${encoded}`,directions:`https://www.google.com/maps/dir/?api=1&destination=${encoded}`};
}
export async function contactDetails() {
  const page=await pageContent('contact');
  return contactFromCopy(Object.fromEntries(page.texts.map(x=>[x.key,x.value])));
}
