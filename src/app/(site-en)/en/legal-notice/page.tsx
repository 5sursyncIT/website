import Link from "next/link";
import { pageMetadata } from "@/lib/page-meta";
import { contactDetails } from "@/lib/contact-details";
import { LEGAL, LEGAL_EN } from "@/lib/legal";
export const revalidate = 300;
export function generateMetadata() {
  return pageMetadata("/mentions-legales", { title: "Legal notice | 5/Sync IT" }, "en");
}
export default async function Page() {
  const contact = await contactDetails();
  return (
    <main id="contenu" className="container legal-page">
      <p className="eyebrow">Legal information</p>
      <h1>Legal notice</h1>
      <p className="updated">Last updated: {LEGAL_EN.updated}</p>
      <p>
        This English translation is provided for convenience. The French{" "}
        <Link href="/mentions-legales" hrefLang="fr">mentions légales</Link> prevail.
      </p>

      <h2>Website publisher</h2>
      <p>
        {LEGAL.name}, {LEGAL_EN.form} with a share capital of {LEGAL.capital}
        <br />
        Trade and Companies Register (RCCM): {LEGAL.rccm} · Tax ID (NINEA): {LEGAL.ninea}
        <br />
        Registered office: {LEGAL_EN.seat(contact.address)}
        <br />
        Phone: <a href={contact.phones[0].href}>{contact.phones[0].display}</a> · Email:{" "}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
      </p>

      <h2>Publication director</h2>
      <p>{LEGAL_EN.publisher}</p>

      <h2>Hosting</h2>
      <p>
        {LEGAL.host.name}, {LEGAL_EN.hostAddress}
        <br />
        <a href={LEGAL.host.url} target="_blank" rel="noopener noreferrer">{LEGAL.host.url.replace("https://", "")}</a>
      </p>

      <h2>Intellectual property</h2>
      <p>
        The texts, visuals, videos, logo and 5/Sync IT brand are the property of {LEGAL.name}.
        Any reproduction or reuse without prior written permission is prohibited. Logos of clients
        and partners shown as references remain the property of their respective owners.
      </p>

      <h2>Liability</h2>
      <p>
        {LEGAL.name} takes care to ensure that the information published on this website is
        accurate, but cannot guarantee that it is complete. Links to third-party websites are
        provided for information only; their content is the responsibility of their publishers.
      </p>

      <h2>Personal data</h2>
      <p>
        How we process your data is described in our{" "}
        <Link href="/en/privacy-policy">privacy policy</Link>.
      </p>

      <h2>Governing law</h2>
      <p>This website and its legal notice are governed by Senegalese law.</p>
    </main>
  );
}
