import Link from "next/link";
import { contactDetails } from "@/lib/contact-details";
import { socialLinks, socialPlatforms } from "@/lib/social";
import { SocialIcon } from "@/components/SocialIcon";
const services = [
  ["/reseaux-cloud", "Réseaux & cloud"],
  ["/solutions-metier", "Solutions métier"],
  ["/developpement-api", "Développement & API"],
  ["/maintenance-support", "Maintenance et support"],
];
const company = [
  ["/services", "Nos services"],
  ["/realisations", "Réalisations"],
  ["/a-propos", "À propos"],
  ["/contact", "Contact"],
];
export async function Footer() {
  const [social, coordinates] = await Promise.all([socialLinks(), contactDetails()]);
  const label = (platform: string) =>
    socialPlatforms.find((p) => p.value === platform)?.label ?? platform;
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Link href="/" className="brand" aria-label="5/Sync IT — Accueil">
            <img
              src="/assets/logo-horizontal.jpeg"
              width="1012"
              height="249"
              alt="5/Sync IT"
            />
          </Link>
          <p>
            Réseaux, outils métier et développement. Une expertise technique au
            service de votre activité.
          </p>
          <Link className="button aqua" href="/contact">
            Parlons de votre besoin <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <nav aria-label="Services">
          <h2>Services</h2>
          <ul>
            {services.map(([href, label]) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Entreprise">
          <h2>5/Sync IT</h2>
          <ul>
            {company.map(([href, label]) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
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
              <Link href="/contact">Formulaire de contact</Link>
            </li>
            <li>
              <Link href="/support">Espace client · Support</Link>
            </li>
          </ul>
          {social.length > 0 && (
            <ul className="footer-social" aria-label="Réseaux sociaux">
              {social.map((link) => (
                <li key={link.platform + link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`5/Sync IT sur ${label(link.platform)}`}
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
          <p>© {new Date().getFullYear()} 5/Sync IT. Tous droits réservés.</p>
          <p>Informatique pour les entreprises • Dakar</p>
          <p className="footer-legal">
            <Link href="/mentions-legales">Mentions légales</Link>
            {" · "}
            <Link href="/politique-de-confidentialite">Confidentialité</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
