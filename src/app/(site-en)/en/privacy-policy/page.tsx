import Link from "next/link";
import { pageMetadata } from "@/lib/page-meta";
import { contactDetails } from "@/lib/contact-details";
import { LEGAL, LEGAL_EN } from "@/lib/legal";
export const revalidate = 300;
export function generateMetadata() {
  return pageMetadata("/politique-de-confidentialite", { title: "Privacy policy | 5/Sync IT" }, "en");
}
export default async function Page() {
  const contact = await contactDetails();
  const mail = <a href={`mailto:${contact.email}`}>{contact.email}</a>;
  return (
    <main id="contenu" className="container legal-page">
      <p className="eyebrow">Personal data</p>
      <h1>Privacy policy</h1>
      <p className="updated">Last updated: {LEGAL_EN.updated}</p>
      <p>
        This English translation is provided for convenience. The French{" "}
        <Link href="/politique-de-confidentialite" hrefLang="fr">politique de confidentialité</Link>{" "}
        prevails.
      </p>
      <p>
        This policy explains which personal data {LEGAL.name} collects on this website, why, how
        long it is kept and how to exercise your rights, in accordance with Senegalese Law
        No. 2008-12 of 25 January 2008 on the protection of personal data.
      </p>

      <h2>Data controller</h2>
      <p>
        {LEGAL.name}, {LEGAL_EN.form}, RCCM {LEGAL.rccm}, {LEGAL_EN.seat(contact.address)}. Contact: {mail}.
      </p>

      <h2>Contact requests</h2>
      <p>
        When you use the contact form, we collect your name, email address and message
        (required) and, if you provide them, your company name, phone number and the topic of your
        request. This data is used only to answer your request and follow up on our exchanges. It
        is stored on our server and a notification is sent to our business mailbox. It is kept for{" "}
        {LEGAL_EN.contactRetention}, unless a contractual relationship follows.
      </p>

      <h2>Client Support portal</h2>
      <p>
        Client portal accounts are created only by invitation from our team. We process each
        user’s name, email address and company, as well as the tickets, messages and files they
        submit. This data is used to provide the support set out in our contractual relationship
        and is kept for its duration. Passwords are never stored in plain text, and files are
        accessible only to the company concerned and to our team.
      </p>

      <h2>Technical data and security</h2>
      <p>
        To protect the website against abuse, IP addresses are used in hashed form (a fingerprint)
        to limit the number of submissions; these counters expire after fifteen minutes and are
        then deleted automatically. The server also keeps technical logs for security purposes.
        Exchanges with the website are encrypted (HTTPS).
      </p>

      <h2>Cookies</h2>
      <p>
        This website uses no advertising cookies and no audience measurement tools. Only a
        technical session cookie is set when you sign in to the client portal; it expires after
        one hour. The Contact page shows a Google Maps map: when it is displayed, Google may
        receive your IP address and set its own cookies, under its{" "}
        <a href="https://policies.google.com/privacy?hl=en" target="_blank" rel="noopener noreferrer">
          privacy policy
        </a>.
      </p>

      <h2>Recipients and hosting</h2>
      <p>
        Your data is intended solely for the {LEGAL.name} team; it is never sold or transferred.
        The website is hosted on a server rented from {LEGAL.host.name}, a provider based in
        Germany, which has no reason to access this data.
      </p>

      <h2>Your rights</h2>
      <p>
        You have the right to access, rectify, object to and delete your data. To exercise these
        rights, write to us at {mail} stating your request. You may also lodge a complaint with
        Senegal’s personal data protection authority, the Commission de protection des données
        personnelles (
        <a href="https://www.cdp.sn" target="_blank" rel="noopener noreferrer">cdp.sn</a>).
      </p>

      <p>
        See also the <Link href="/en/legal-notice">legal notice</Link>.
      </p>
    </main>
  );
}
