import Link from "next/link";
import { contactDetails } from "@/lib/contact-details";
import { socialLinks, socialPlatforms } from "@/lib/social";
import { SocialIcon } from "@/components/SocialIcon";
import { type Locale, localePath } from "@/lib/locale";
const copy = {
  fr: {
    services: [["/reseaux-cloud", "Réseaux & cloud"], ["/solutions-metier", "Solutions métier"], ["/developpement-api", "Développement & API"], ["/maintenance-support", "Maintenance et support"]],
    company: [["/services", "Nos services"], ["/realisations", "Réalisations"], ["/a-propos", "À propos"], ["/contact", "Contact"]],
    home: "5/Sync IT — Accueil",
    tagline: "Réseaux, outils métier et développement. Une expertise technique au service de votre activité.",
    cta: "Parlons de votre besoin", companyLabel: "Entreprise", form: "Formulaire de contact",
    support: "Espace client · Support", social: "Réseaux sociaux", on: "5/Sync IT sur",
    rights: "Tous droits réservés.", baseline: "Informatique pour les entreprises • Dakar",
    legal: "Mentions légales", privacy: "Confidentialité",
  },
  en: {
    services: [["/reseaux-cloud", "Networks & cloud"], ["/solutions-metier", "Business solutions"], ["/developpement-api", "Development & APIs"], ["/maintenance-support", "Maintenance & support"]],
    company: [["/services", "Our services"], ["/realisations", "Projects"], ["/a-propos", "About"], ["/contact", "Contact"]],
    home: "5/Sync IT — Home",
    tagline: "Networks, business software and development. Technical expertise that serves your business.",
    cta: "Tell us what you need", companyLabel: "Company", form: "Contact form",
    support: "Client portal · Support (in French)", social: "Social media", on: "5/Sync IT on",
    rights: "All rights reserved.", baseline: "IT for businesses • Dakar",
    legal: "Legal notice", privacy: "Privacy",
  },
};
export async function Footer({ locale = "fr" }: { locale?: Locale }) {
  const l = copy[locale];
  const lp = (path: string) => localePath(locale, path);
  const [social, coordinates] = await Promise.all([socialLinks(), contactDetails()]);
  const label = (platform: string) =>
    socialPlatforms.find((p) => p.value === platform)?.label ?? platform;
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Link href={lp("/")} className="brand" aria-label={l.home}>
            <img
              src="/assets/logo-horizontal.jpeg"
              width="1012"
              height="249"
              alt="5/Sync IT"
            />
          </Link>
          <p>{l.tagline}</p>
          <Link className="button aqua" href={lp("/contact")}>
            {l.cta} <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <nav aria-label="Services">
          <h2>Services</h2>
          <ul>
            {l.services.map(([href, label]) => (
              <li key={href}>
                <Link href={lp(href)}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={l.companyLabel}>
          <h2>5/Sync IT</h2>
          <ul>
            {l.company.map(([href, label]) => (
              <li key={href}>
                <Link href={lp(href)}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2>Contact</h2>
          <ul>
            {coordinates.phones.map(phone => <li key={phone.href}><a className="footer-phone" href={phone.href}>{phone.display}</a></li>)}
            <li><a href={`mailto:${coordinates.email}`}>{coordinates.email}</a></li>
            <li><address>{coordinates.address}</address></li>
            <li>
              <Link href={lp("/contact")}>{l.form}</Link>
            </li>
            <li>
              <Link href="/support">{l.support}</Link>
            </li>
          </ul>
          {social.length > 0 && (
            <ul className="footer-social" aria-label={l.social}>
              {social.map((link) => (
                <li key={link.platform + link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${l.on} ${label(link.platform)}`}
                    title={label(link.platform)}
                  >
                    <SocialIcon platform={link.platform} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <p>© {new Date().getFullYear()} 5/Sync IT. {l.rights}</p>
          <p>{l.baseline}</p>
          <p className="footer-legal">
            <Link href={lp("/mentions-legales")}>{l.legal}</Link>
            {" · "}
            <Link href={lp("/politique-de-confidentialite")}>{l.privacy}</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
