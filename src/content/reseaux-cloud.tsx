import { HeroVideo } from "@/components/HeroVideo";
import type React from "react";
import { ContactForm } from "@/components/ContactForm";
export default function PageReseauxCloud({
  texts = {},
}: {
  texts?: Record<string, string>;
}) {
  const t = (key: string, fallback: string) => texts[key] ?? fallback;
  return (
    <main id="contenu">
      <section className="hero dark motion-hero  network">
        <HeroVideo poster="/assets/motion/posters/reseaux-cloud.jpg" sources={[{src:"/assets/motion/videos/reseaux-cloud.mp4",type:"video/mp4"}]} label="Illustration — Réseaux et cloud" />
        <div className="container hero-inner">
          <nav className="breadcrumb" aria-label="Fil d’Ariane">
            <a href="/services">{t("text-0", "Services")}</a>
            <span>{"/"}</span>
            <span>{t("text-1", "Réseaux & cloud")}</span>
          </nav>
          <h1>
            {t("text-2", "Connectez vos équipes.")}
            <br />
            {t("text-3", " Structurez vos ressources.")}
          </h1>
          <p className="hero-description">
            {t("text-4", "Réseaux, serveurs et cloud : une infrastructure")}
            <br />
            {t("text-5", " pensée pour vos usages et votre organisation.")}
          </p>
          <a className="button aqua" href="/contact">
            {t("text-6", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
        <span className="illustration-label">
          {t("text-7", "Visuel d’illustration")}
        </span>
      </section>
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-8", "01 / Périmètre")}</p>
          <h2>{t("text-9", "Un environnement cohérent, de bout en bout.")}</h2>
          <div className="features ">
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
                  <rect x="16" y="3" width="16" height="12" rx="2"></rect>
                  <path d="M24 15v10M8 25h32M8 25v7M24 25v7M40 25v7"></path>
                  <rect x="2" y="32" width="12" height="11" rx="1"></rect>
                  <rect x="18" y="32" width="12" height="11" rx="1"></rect>
                  <rect x="34" y="32" width="12" height="11" rx="1"></rect>
                </svg>
              </div>
              <div>
                <h3>{t("text-10", "Réseaux locaux & Wi-Fi")}</h3>
                <p>
                  {t(
                    "text-11",
                    "Une couverture adaptée à vos espaces et à vos équipes.",
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
                  <path d="m20 15 7-7a9 9 0 0 1 13 13l-8 8M28 33l-7 7A9 9 0 0 1 8 27l8-8M16 32l16-16"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-12", "Interconnexion & VPN")}</h3>
                <p>
                  {t("text-13", "Relier vos sites et organiser les accès.")}
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
                  <path d="M12 38a10 10 0 0 1-2-20 14 14 0 0 1 27-1 11 11 0 0 1 0 21Z"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-14", "Serveurs & cloud")}</h3>
                <p>
                  {t(
                    "text-15",
                    "Préparer vos migrations et vos environnements.",
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
                  <path d="M24 3 42 10v14c0 10-10 18-18 22C16 42 6 34 6 24V10Z"></path>
                </svg>
              </div>
              <div>
                <h3>{t("text-16", "Protection & sauvegardes")}</h3>
                <p>
                  {t(
                    "text-17",
                    "Définir les accès et les conditions de reprise.",
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section pale">
        <div className="container">
          <p className="eyebrow">{t("text-18", "02 / Méthode")}</p>
          <h2>{t("text-19", "Chaque projet part de votre terrain.")}</h2>
          <div
            className="steps "
            style={{ "--count": "4" } as React.CSSProperties}
          >
            <div className="step">
              <span className="number">{"01"}</span>
              <h3>{t("text-20", "Comprendre")}</h3>
              <p>{t("text-21", "Sites, usages, contraintes")}</p>
            </div>
            <div className="step">
              <span className="number">{"02"}</span>
              <h3>{t("text-22", "Concevoir")}</h3>
              <p>{t("text-23", "Architecture et périmètre")}</p>
            </div>
            <div className="step">
              <span className="number">{"03"}</span>
              <h3>{t("text-24", "Déployer")}</h3>
              <p>{t("text-25", "Installation et tests")}</p>
            </div>
            <div className="step">
              <span className="number">{"04"}</span>
              <h3>{t("text-26", "Transmettre")}</h3>
              <p>{t("text-27", "Documentation et suivi")}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="section tight">
        <div className="container">
          <div className="project-teaser">
            <div>
              <p className="eyebrow">{t("text-28", "Réalisation")}</p>
              <h2>{t("text-29", "Groupe Hage")}</h2>
              <p>{t("text-30", "Réseau Wi-Fi")}</p>
              <a className="text-link" href="/realisations#groupe-hage">
                {t("text-31", "Voir le projet ")}
                <span aria-hidden="true">{"↗"}</span>
              </a>
            </div>
            <figure>
              <div
                className="crop "
                role="img"
                aria-label="Illustration du domaine d’intervention"
                style={{ aspectRatio: "481/130" } as React.CSSProperties}
              >
                <img
                  src="/assets/03_Reseaux-cloud.webp"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  style={
                    {
                      width: "197.0893970893971%",
                      height: "1276.923076923077%",
                      left: "-87.94178794178794%",
                      top: "-827.6923076923077%",
                    } as React.CSSProperties
                  }
                  draggable="false"
                />
              </div>
              <figcaption>
                {t("text-32", "Illustration du domaine d’intervention")}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-33", "03 / Questions fréquentes")}</p>
          <h2>{t("text-34", "Avant de démarrer.")}</h2>
          <div className="faq">
            <details open={true}>
              <summary>{t("text-35", "Faut-il tout remplacer ?")}</summary>
              <p>
                {t(
                  "text-36",
                  "Nous étudions l’existant et les évolutions réellement utiles.",
                )}
              </p>
            </details>
            <details open={true}>
              <summary>{t("text-37", "Cloud ou serveurs sur site ?")}</summary>
              <p>
                {t(
                  "text-38",
                  "Le choix dépend de vos applications, de vos accès et de vos contraintes.",
                )}
              </p>
            </details>
          </div>
        </div>
      </section>
      <section className="cta dark">
        <div className="container cta-inner">
          <div>
            <h2>{t("text-39", "Votre réseau doit évoluer ?")}</h2>
            <p>
              {t(
                "text-40",
                "Présentez-nous votre installation et votre projet.",
              )}
            </p>
          </div>
          <a className="button aqua" href="/contact">
            {t("text-41", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
    </main>
  );
}
