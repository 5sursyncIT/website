import { HeroVideo } from "@/components/HeroVideo";
import type React from "react";
import { type Locale, localePath } from "@/lib/locale";
import { tr as translate } from "@/lib/i18n";
import { ContactForm } from "@/components/ContactForm";
import { contactFromCopy } from "@/lib/contact-details";
import { ContactMap } from "@/components/ContactMap";
import { serviceLabel, serviceTopic } from "@/lib/contact-topics";
export default function PageContact({
  locale = "fr",
  texts = {},
  service = "",
}: {
  locale?: Locale;
  texts?: Record<string, string>;
  service?: string;
}) {
  const details = contactFromCopy(texts);
  const tr = (text: string) => translate(locale, text);
  const lp = (path: string) => localePath(locale, path);
  const t = (key: string, fallback: string) => tr(texts[key] ?? fallback);
  return (
    <main id="contenu">
      <section className="hero dark motion-hero motion-main compact contact-hero">
        <HeroVideo locale={locale}
          poster="/assets/motion/posters/main-contact.jpg"
          sources={[{ src: "/assets/motion/videos/main-contact.mp4", type: "video/mp4" }]}
          label={tr("Illustration — Contact et accompagnement")}
        />
        <div className="container hero-inner">
          <p className="eyebrow">{t("text-0", "Contact")}</p>
          <h1>{t("text-1", "Parlons de votre besoin.")}</h1>
          <div className="short-rule"></div>
          <p className="hero-description">
            {t(
              "text-2",
              "Un projet, une question ou un besoin d’accompagnement ?",
            )}
            <br />
            {t("text-3", " Présentez-nous votre contexte.")}
          </p>
        </div>
      </section>
      <section className="section ">
        <div className="container">
          <div className="contact-layout">
            <aside>
              <h2>
                {t("text-4", "Échangeons sur")}
                <br />
                {t("text-5", " votre projet.")}
              </h2>
              <p>
                {t(
                  "text-6",
                  "Réseaux, solutions métier, développement ou support : décrivez votre besoin en quelques mots.",
                )}
              </p>
              <div className="contact-detail">
                <svg
                  className="icon"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="9" width="42" height="30" rx="1"></rect>
                  <path d="m3 9 21 18L45 9"></path>
                </svg>
                <div>
                  <span>{t("text-7", "Écrivez-nous")}</span>
                  <p><a href={`mailto:${details.email}`}>{details.email}</a></p>
                </div>
              </div>
              <div className="contact-detail">
                <svg
                  className="icon"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17 5H9a4 4 0 0 0-4 4c0 19 15 34 34 34a4 4 0 0 0 4-4v-8l-10-4-5 5c-6-3-10-7-13-13l5-5Z"></path>
                </svg>
                <div>
                  <span>{t("phone-label", "Appelez-nous")}</span>
                  <ul className="contact-phones">{details.phones.map(phone => <li key={phone.href}><a href={phone.href}>{phone.display}</a></li>)}</ul>
                </div>
              </div>
              <div className="contact-detail">
                <svg
                  className="icon"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M24 46S8 28 8 18a16 16 0 0 1 32 0c0 10-16 28-16 28Z"></path>
                  <circle cx="24" cy="18" r="5"></circle>
                </svg>
                <div><span>{tr("Adresse")}</span><address>{details.address}</address></div>
              </div>
              <div className="aside-services">
                <h3>{t("text-10", "Nos expertises")}</h3>
                <a href={lp("/reseaux-cloud")}>
                  {t("text-11", "Réseaux & cloud ")}
                  <span aria-hidden="true">{"↗"}</span>
                </a>
                <a href={lp("/solutions-metier")}>
                  {t("text-12", "Solutions métier ")}
                  <span aria-hidden="true">{"↗"}</span>
                </a>
                <a href={lp("/developpement-api")}>
                  {t("text-13", "Développement & API ")}
                  <span aria-hidden="true">{"↗"}</span>
                </a>
                <a href={lp("/maintenance-support")}>
                  {t("text-14", "Maintenance et support ")}
                  <span aria-hidden="true">{"↗"}</span>
                </a>
              </div>
            </aside>
            <div>
              <h2>{t("text-15", "Votre message")}</h2>
              {service && (
                <p className="form-help">
                  {tr("Votre demande concerne")} <strong>{serviceLabel(service)}</strong>.{" "}
                  {tr("Vous pouvez changer le sujet ci-dessous.")}
                </p>
              )}
              <ContactForm locale={locale} topic={serviceTopic(service)} service={service} />
            </div>
          </div>
        </div>
      </section>
      <ContactMap details={details} texts={texts} locale={locale} />
      <section className="section pale">
        <div className="container">
          <p className="eyebrow">
            {t("text-16", "Pour bien préparer notre échange")}
          </p>
          <h2>{t("text-17", "Pour bien préparer notre échange.")}</h2>
          <div className="features columns compact-features">
            <div className="feature">
              <div className="icon-wrap">
                <svg
                  className="icon"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3h17l10 10v32H12Z M29 3v12h10M18 24h15M18 31h15M18 38h11"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-18", "Votre contexte")}</h3>
                <p>{t("text-19", "Votre activité et votre environnement.")}</p>
              </div>
            </div>
            <div className="feature">
              <div className="icon-wrap">
                <svg
                  className="icon"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="23" cy="25" r="20"></circle>
                  <circle cx="23" cy="25" r="12"></circle>
                  <path d="m23 25 21-22M34 3v10h11"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-20", "Votre besoin")}</h3>
                <p>{t("text-21", "L’objectif ou la difficulté à résoudre.")}</p>
              </div>
            </div>
            <div className="feature">
              <div className="icon-wrap">
                <svg
                  className="icon"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="4" y="8" width="40" height="36" rx="4"></rect>
                  <path d="M4 19h40M14 2v12M34 2v12M12 27h5M24 27h5M12 35h5M24 35h5"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-22", "Vos contraintes")}</h3>
                <p>
                  {t("text-23", "Les priorités et le calendrier envisagé.")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
