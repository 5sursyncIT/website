import { CONTACT_MAP_POINT, contactDetails } from "@/lib/contact-details";
import { socialLinks } from "@/lib/social";
import { siteOrigin } from "@/lib/site-meta";

// Countries confirmed for the "Interventions Afrique" section.
const areaServed = [
  "Sénégal",
  "Côte d’Ivoire",
  "Guinée",
  "Guinée-Bissau",
  "République démocratique du Congo",
  "République du Congo",
];

// schema.org data for search engines, built only from CMS contact details and social links.
export async function OrganizationJsonLd() {
  const [contact, social] = await Promise.all([contactDetails(), socialLinks()]);
  const id = `${siteOrigin}/#organisation`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        "@id": id,
        name: "5/Sync IT",
        url: siteOrigin,
        logo: `${siteOrigin}/assets/logo-horizontal.jpeg`,
        image: `${siteOrigin}/assets/og-5sursync.jpg`,
        email: contact.email,
        telephone: contact.phones[0]?.href.replace(/^tel:/, ""),
        address: {
          "@type": "PostalAddress",
          streetAddress: contact.address.replace(/,\s*Sénégal$/, ""),
          addressLocality: "Keur Massar",
          addressRegion: "Dakar",
          addressCountry: "SN",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: Number(CONTACT_MAP_POINT.latitude),
          longitude: Number(CONTACT_MAP_POINT.longitude),
        },
        areaServed: areaServed.map((name) => ({ "@type": "Country", name })),
        sameAs: social.filter((s) => s.platform !== "whatsapp").map((s) => s.url),
      },
      {
        "@type": "WebSite",
        "@id": `${siteOrigin}/#site`,
        name: "5/Sync IT",
        url: siteOrigin,
        inLanguage: "fr",
        publisher: { "@id": id },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // Escaped so CMS-entered text cannot close the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
