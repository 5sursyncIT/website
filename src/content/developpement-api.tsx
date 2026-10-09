import { HeroVideo } from "@/components/HeroVideo";
import type React from "react";
import { type Locale, localePath } from "@/lib/locale";
import { tr as translate } from "@/lib/i18n";
import { ContactForm } from "@/components/ContactForm";
export default function PageDeveloppementApi({
  locale = "fr",
  texts = {},
}: {
  locale?: Locale;
  texts?: Record<string, string>;
}) {
  const tr = (text: string) => translate(locale, text);
  const lp = (path: string) => localePath(locale, path);
  const t = (key: string, fallback: string) => tr(texts[key] ?? fallback);
  return (
    <main id="contenu">
      <section className="hero dark motion-hero  development">
        <HeroVideo locale={locale} poster="/assets/motion/posters/developpement-api.jpg" sources={[{src:"/assets/motion/videos/developpement-api.mp4",type:"video/mp4"}]} label={tr("Illustration — Développement et API")} />
        <div className="container hero-inner">
          <nav className="breadcrumb" aria-label={tr("Fil d’Ariane")}>
            <a href={lp("/services")}>{t("text-3", "Services")}</a>
            <span>{"/"}</span>
            <span>{t("text-4", "Développement & API")}</span>
          </nav>
          <h1>
            {t("text-5", "Créez les outils.")}
            <br />
            {t("text-6", " Connectez les usages.")}
          </h1>
          <p className="hero-description">
            {t(
              "text-7",
              "Applications web et mobiles, sites et intégrations :",
            )}
            <br />
            {t("text-8", " des solutions conçues autour de votre activité.")}
          </p>
          <a className="button aqua" href={lp("/contact")}>
            {t("text-9", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
        <span className="illustration-label">
          {t("text-10", "Schéma d’illustration")}
        </span>
      </section>
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-11", "01 / Périmètre")}</p>
          <h2>{t("text-12", "Du besoin à une solution utile.")}</h2>
          <div className="features columns">
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
                  <rect x="3" y="5" width="42" height="37" rx="3"></rect>
                  <path d="M3 15h42M9 10h2M16 10h2M20 23l-7 6 7 6M28 23l7 6-7 6"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-13", "Applications sur mesure")}</h3>
                <p>
                  {t(
                    "text-14",
                    "Portails, outils de gestion et parcours adaptés aux utilisateurs.",
                  )}
                </p>
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
                  <path d="M12 4v13M36 4v13M6 17h36M10 17v8a14 14 0 0 0 28 0v-8M24 39v8"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-15", "Intégrations & API")}</h3>
                <p>
                  {t(
                    "text-16",
                    "Faire circuler les données entre vos logiciels, selon les accès disponibles.",
                  )}
                </p>
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
                  <circle cx="24" cy="24" r="21"></circle>
                  <ellipse cx="24" cy="24" rx="9" ry="21"></ellipse>
                  <path d="M4 17h40M4 31h40"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-17", "Sites web")}</h3>
                <p>
                  {t(
                    "text-18",
                    "Présenter votre activité et orienter les visiteurs vers la bonne action.",
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section pale">
        <div className="container">
          <p className="eyebrow">{t("text-19", "02 / Méthode")}</p>
          <h2>{t("text-20", "Un projet lisible à chaque étape.")}</h2>
          <div className="development-method">
            <p>
              {t("text-21", "Fonctions, dépendances, tests")}
              <br />
              {t("text-22", " et conditions de livraison sont")}
              <br />
              {t("text-23", " définis ensemble.")}
            </p>
            <ol className="timeline">
              <li>
                <span>{"01"}</span>
                {t("text-24", "Cadrer les usages")}
              </li>
              <li>
                <span>{"02"}</span>
                {t("text-25", "Concevoir les parcours")}
              </li>
              <li>
                <span>{"03"}</span>
                {t("text-26", "Développer et tester")}
              </li>
              <li>
                <span>{"04"}</span>
                {t("text-27", "Livrer et documenter")}
              </li>
            </ol>
          </div>
          <div className="note">
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
            <div>
              <strong>{t("text-28", "Penser aussi à la suite.")}</strong>
              <p>
                {t(
                  "text-29",
                  "Maintenance, documentation et accès d’administration sont à préciser dès le cadrage.",
                )}
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-30", "03 / Questions fréquentes")}</p>
          <h2>{t("text-31", "Avant d’écrire la première ligne.")}</h2>
          <div className="faq">
            <details open={true}>
              <summary>
                {t("text-32", "Faut-il déjà un cahier des charges ?")}
              </summary>
              <p>
                {t(
                  "text-33",
                  "Non. Décrivez d’abord ce que vos équipes veulent pouvoir faire.",
                )}
              </p>
            </details>
            <details open={true}>
              <summary>
                {t("text-34", "Tous les logiciels peuvent-ils se connecter ?")}
              </summary>
              <p>
                {t(
                  "text-35",
                  "Cela dépend des API, des droits d’accès et des limites de chaque système.",
                )}
              </p>
            </details>
          </div>
        </div>
      </section>
      <section className="cta dark">
        <div className="container cta-inner">
          <div>
            <h2>{t("text-36", "Une idée, un outil à faire évoluer ?")}</h2>
            <p>
              {t("text-37", "Parlons de vos utilisateurs et de vos besoins.")}
            </p>
          </div>
          <a className="button aqua" href={lp("/contact")}>
            {t("text-38", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
    </main>
  );
}
