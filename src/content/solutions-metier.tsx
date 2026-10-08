import { HeroVideo } from "@/components/HeroVideo";
import { CatalogueSection } from "@/components/CatalogueSection";
import type React from "react";
import { ContactForm } from "@/components/ContactForm";
export default function PageSolutionsMetier({
  texts = {},
}: {
  texts?: Record<string, string>;
}) {
  const t = (key: string, fallback: string) => texts[key] ?? fallback;
  return (
    <main id="contenu">
      <section className="hero dark motion-hero  business">
        <HeroVideo poster="/assets/motion/posters/solutions-metier.jpg" sources={[{src:"/assets/motion/videos/solutions-metier.mp4",type:"video/mp4"}]} label="Illustration — Solutions métier" />
        <div className="container hero-inner">
          <nav className="breadcrumb" aria-label="Fil d’Ariane">
            <a href="/services">{t("text-4", "Services")}</a>
            <span>{"/"}</span>
            <span>{t("text-5", "Solutions métier")}</span>
          </nav>
          <h1>
            {t("text-6", "Des outils adaptés")}
            <br />
            {t("text-7", " au travail de vos équipes.")}
          </h1>
          <p className="hero-description">
            {t("text-8", "ERP et logiciels métier : clarifier vos processus,")}
            <br />
            {t("text-9", " préparer le déploiement et accompagner les usages.")}
          </p>
          <a className="button aqua" href="/contact">
            {t("text-10", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
        <span className="illustration-label">
          {t("text-11", "Schéma d’illustration")}
        </span>
      </section>
      <CatalogueSection texts={texts} />
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-12", "01 / Périmètre")}</p>
          <h2>{t("text-13", "Partir de votre fonctionnement.")}</h2>
          <div className="split-statement">
            <h3>
              {t("text-14", "Les bons outils")}
              <br />
              {t("text-15", " commencent par")}
              <br />
              {t("text-16", " les bonnes questions.")}
            </h3>
            <div className="features stacked">
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
                  <h3>{t("text-17", "Cadrer les besoins")}</h3>
                  <p>
                    {t(
                      "text-18",
                      "Opérations, utilisateurs, données et priorités.",
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
                    <path
                      d="M19 5h10l1 6 5 3 6-2 5 9-5 4v5l4 4-5 9-6-2-5 3-1 5H18l-1-6-5-3-6 2-5-9 5-4v-5l-4-4 5-9 6 2 5-3Z"
                      transform="translate(0 -3) scale(.94)"
                    ></path>
                    <circle cx="23" cy="22" r="7"></circle>
                  </svg>
                </div>
                <div>
                  <h3>{t("text-19", "Préparer le déploiement")}</h3>
                  <p>
                    {t("text-20", "Paramétrage, reprise des données et tests.")}
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
                    <circle cx="17" cy="14" r="7"></circle>
                    <path d="M4 42v-5a13 13 0 0 1 26 0v5M31 8a7 7 0 0 1 0 14M36 28c6 1 9 5 9 10v4"></path>
                  </svg>
                </div>
                <div>
                  <h3>{t("text-21", "Accompagner les équipes")}</h3>
                  <p>
                    {t(
                      "text-22",
                      "Prise en main, mise en service et support à définir.",
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section pale">
        <div className="container">
          <p className="eyebrow">{t("text-23", "02 / Méthode")}</p>
          <h2>{t("text-24", "Du processus à l’usage.")}</h2>
          <div
            className="steps "
            style={{ "--count": "4" } as React.CSSProperties}
          >
            <div className="step">
              <span className="number">{"01"}</span>
              <h3>{t("text-25", "Observer")}</h3>
              <p>{t("text-26", "Vos pratiques actuelles")}</p>
            </div>
            <div className="step">
              <span className="number">{"02"}</span>
              <h3>{t("text-27", "Paramétrer")}</h3>
              <p>{t("text-28", "Les fonctions retenues")}</p>
            </div>
            <div className="step">
              <span className="number">{"03"}</span>
              <h3>{t("text-29", "Tester")}</h3>
              <p>{t("text-30", "Les cas concrets")}</p>
            </div>
            <div className="step">
              <span className="number">{"04"}</span>
              <h3>{t("text-31", "Accompagner")}</h3>
              <p>{t("text-32", "La prise en main")}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="section dark exchange">
        <div className="container">
          <h2>{t("text-33", "Vos logiciels doivent échanger ?")}</h2>
          <p>
            {t(
              "text-34",
              "Nous étudions les intégrations possibles et les contraintes de chaque éditeur.",
            )}
          </p>
        </div>
      </section>
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-35", "03 / Questions fréquentes")}</p>
          <h2>{t("text-36", "Un projet bien délimité.")}</h2>
          <div className="faq">
            <details open={true}>
              <summary>
                {t("text-37", "Peut-on garder certains outils ?")}
              </summary>
              <p>
                {t(
                  "text-38",
                  "Oui, leur rôle et les échanges possibles sont étudiés au cadrage.",
                )}
              </p>
            </details>
            <details open={true}>
              <summary>{t("text-39", "Le support est-il inclus ?")}</summary>
              <p>
                {t(
                  "text-40",
                  "Son périmètre et ses modalités sont précisés dans la proposition.",
                )}
              </p>
            </details>
          </div>
        </div>
      </section>
      <section className="cta ">
        <div className="container cta-inner">
          <div>
            <h2>{t("text-41", "Parlons de votre organisation.")}</h2>
            <p>
              {t(
                "text-42",
                "Quels outils utilisez-vous ? Qu’aimeriez-vous simplifier ?",
              )}
            </p>
          </div>
          <a className="button navy" href="/contact">
            {t("text-43", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
    </main>
  );
}
