// Company identity confirmed by the owner (RCCM extract), used by the legal pages.
export const LEGAL = {
  name: "5/Sync IT",
  form: "SUARL",
  capital: "1 000 000 FCFA",
  rccm: "SN.DKR.2016.A.3514",
  ninea: "005812351 1R1",
  publisher: "Youssoupha Diop, gérant",
  updated: "7 octobre 2026",
  contactRetention: "trois ans à compter du dernier échange",
  host: {
    name: "Contabo GmbH",
    address: "Welfenstraße 22, 81541 Munich, Allemagne",
    url: "https://contabo.com",
  },
  // Almadie 2 is in Keur Massar (Dakar region), as on the Google Business Profile and map point.
  seat: (address: string) => {
    const street = address.replace(/,\s*Sénégal$/, "");
    return `${/keur massar/i.test(street) ? street : `${street}, Keur Massar`}, Dakar, Sénégal`;
  },
};
// English renderings of the translatable fields above, for the /en legal pages.
export const LEGAL_EN = {
  form: "single-member limited liability company (SUARL)",
  publisher: "Youssoupha Diop, Manager",
  updated: "7 October 2026",
  contactRetention: "three years from our last exchange",
  hostAddress: "Welfenstraße 22, 81541 Munich, Germany",
  seat: (address: string) => LEGAL.seat(address).replace(/Sénégal$/, "Senegal"),
};
