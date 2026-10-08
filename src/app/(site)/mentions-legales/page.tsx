import Link from "next/link";
import { pageMetadata } from "@/lib/page-meta";
import { contactDetails } from "@/lib/contact-details";
import { LEGAL } from "@/lib/legal";
export const revalidate = 300;
export function generateMetadata() {
  return pageMetadata("/mentions-legales", { title: "Mentions légales | 5/Sync IT" });
}
export default async function Page() {
  const contact = await contactDetails();
  return (
    <main id="contenu" className="container legal-page">
      <p className="eyebrow">Informations légales</p>
      <h1>Mentions légales</h1>
      <p className="updated">Dernière mise à jour : {LEGAL.updated}</p>

      <h2>Éditeur du site</h2>
      <p>
        {LEGAL.name}, {LEGAL.form} au capital de {LEGAL.capital}
        <br />
        RCCM : {LEGAL.rccm} · NINEA : {LEGAL.ninea}
        <br />
        Siège : {LEGAL.seat(contact.address)}
        <br />
        Téléphone : <a href={contact.phones[0].href}>{contact.phones[0].display}</a> · E-mail :{" "}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
      </p>

      <h2>Directeur de la publication</h2>
      <p>{LEGAL.publisher}</p>

      <h2>Hébergement</h2>
      <p>
        {LEGAL.host.name}, {LEGAL.host.address}
        <br />
        <a href={LEGAL.host.url} target="_blank" rel="noopener noreferrer">{LEGAL.host.url.replace("https://", "")}</a>
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Les textes, visuels, vidéos, le logo et la marque 5/Sync IT sont la propriété de {LEGAL.name}.
        Toute reproduction ou réutilisation sans autorisation écrite préalable est interdite.
        Les logos des clients et partenaires présentés en référence restent la propriété de leurs
        titulaires respectifs.
      </p>

      <h2>Responsabilité</h2>
      <p>
        {LEGAL.name} veille à l’exactitude des informations publiées sur ce site, sans pouvoir en
        garantir l’exhaustivité. Les liens vers des sites tiers sont fournis à titre d’information ;
        leur contenu relève de la responsabilité de leurs éditeurs.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le traitement de vos données est décrit dans notre{" "}
        <Link href="/politique-de-confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>Droit applicable</h2>
      <p>Le présent site et ses mentions légales sont soumis au droit sénégalais.</p>
    </main>
  );
}
