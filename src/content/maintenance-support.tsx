import { HeroVideo } from "@/components/HeroVideo";
import type React from "react";
import { type Locale, localePath } from "@/lib/locale";
import { tr as translate } from "@/lib/i18n";
import { ContactForm } from "@/components/ContactForm";
import { ServiceCases } from "@/components/ServiceCases";
import type { CaseStudy } from "@/lib/showcase";
export default function PageMaintenanceSupport({
  locale = "fr",
  texts = {},
  cases = [],
}: {
  locale?: Locale;
  texts?: Record<string, string>;
  cases?: CaseStudy[];
}) {
  const tr = (text: string) => translate(locale, text);
  const lp = (path: string) => localePath(locale, path);
  const t = (key: string, fallback: string) => tr(texts[key] ?? fallback);
  return (
    <main id="contenu">
      <section className="hero dark motion-hero  support">
        <HeroVideo locale={locale} poster="/assets/motion/posters/maintenance-support.jpg" sources={[{src:"/assets/motion/videos/maintenance-support.mp4",type:"video/mp4"}]} label={tr("Illustration — Maintenance et support")} />
        <div className="container hero-inner">
          <nav className="breadcrumb" aria-label={tr("Fil d’Ariane")}>
            <a href={lp("/services")}>{t("text-0", "Services")}</a>
            <span>{"/"}</span>
            <span>{t("text-1", "Maintenance et support")}</span>
          </nav>
          <h1>
            {t("text-2", "Un suivi clair pour")}
            <br />
            {t("text-3", " votre informatique.")}
          </h1>
          <p className="hero-description">
            {t(
              "text-4",
              "Accompagner vos utilisateurs, traiter les incidents et",
            )}
            <br />
            {t("text-5", " organiser les prochaines actions de maintenance.")}
          </p>
          <a className="button aqua" href={lp("/contact?service=maintenance-support")}>
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
          <h2>{t("text-9", "Des besoins courants, un cadre défini.")}</h2>
          <div className="features numbered">
            <div className="feature">
              <span className="number">{"01"}</span>
              <div>
                <h3>{t("text-10", "Assistance utilisateurs")}</h3>
                <p>
                  {t(
                    "text-11",
                    "Aider les équipes sur les postes et logiciels concernés.",
                  )}
                </p>
              </div>
            </div>
            <div className="feature">
              <span className="number">{"02"}</span>
              <div>
                <h3>{t("text-12", "Diagnostic & incidents")}</h3>
                <p>
                  {t(
                    "text-13",
                    "Identifier les causes et traiter les équipements couverts.",
                  )}
                </p>
              </div>
            </div>
            <div className="feature">
              <span className="number">{"03"}</span>
              <div>
                <h3>{t("text-14", "Maintenance préventive")}</h3>
                <p>
                  {t(
                    "text-15",
                    "Planifier les vérifications selon les besoins du parc.",
                  )}
                </p>
              </div>
            </div>
            <div className="feature">
              <span className="number">{"04"}</span>
              <div>
                <h3>{t("text-16", "Conseil & évolutions")}</h3>
                <p>
                  {t(
                    "text-17",
                    "Préparer les mises à jour et les renouvellements utiles.",
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section dark">
        <div className="container">
          <p className="eyebrow">{t("text-18", "02 / Méthode")}</p>
          <h2>{t("text-19", "Passer du dépannage au suivi.")}</h2>
          <div
            className="steps "
            style={{ "--count": "4" } as React.CSSProperties}
          >
            <div className="step">
              <span className="number">{"01"}</span>
              <h3>{t("text-20", "Faire le point")}</h3>
              <p>{t("text-21", "Parc et usages")}</p>
            </div>
            <div className="step">
              <span className="number">{"02"}</span>
              <h3>{t("text-22", "Prioriser")}</h3>
              <p>{t("text-23", "Actions à engager")}</p>
            </div>
            <div className="step">
              <span className="number">{"03"}</span>
              <h3>{t("text-24", "Intervenir")}</h3>
              <p>{t("text-25", "Périmètre convenu")}</p>
            </div>
            <div className="step">
              <span className="number">{"04"}</span>
              <h3>{t("text-26", "Suivre")}</h3>
              <p>{t("text-27", "Incidents et évolutions")}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="section tight">
        <div className="container">
          <div className="two-col text-split">
            <h2>{t("text-28", "En appui de votre équipe.")}</h2>
            <p>
              {t(
                "text-29",
                "Avec ou sans responsable informatique en interne, nous précisons ensemble les responsabilités et les modalités d’intervention.",
              )}
            </p>
          </div>
        </div>
      </section>
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-30", "03 / Questions fréquentes")}</p>
          <h2>{t("text-31", "Le bon accompagnement pour vous.")}</h2>
          <div className="faq">
            <details open={true}>
              <summary>{t("text-32", "Ponctuel ou régulier ?")}</summary>
              <p>
                {t(
                  "text-33",
                  "Une intervention ciblée ou un suivi dans la durée, selon votre besoin.",
                )}
              </p>
            </details>
            <details open={true}>
              <summary>
                {t("text-34", "Que préparer pour le premier échange ?")}
              </summary>
              <p>
                {t(
                  "text-35",
                  "Le nombre d’utilisateurs, vos équipements et les incidents récurrents.",
                )}
              </p>
            </details>
          </div>
        </div>
      </section>
      <section className="section support-access"><div className="container"><p>{t("support-access-label", "Déjà client ?")} <a href={lp("/support/connexion")}>{t("support-access-link", "Accéder à votre espace Support")}</a></p></div></section>
      <section className="cta pale">
        <div className="container cta-inner">
          <div>
            <h2>{t("text-36", "Commençons par votre situation.")}</h2>
            <p>
              {t(
                "text-37",
                "Un problème récurrent, un parc à suivre ou une évolution à préparer ?",
              )}
            </p>
          </div>
          <a className="button aqua" href={lp("/contact?service=maintenance-support")}>
            {t("text-38", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
      <ServiceCases cases={cases} locale={locale} />
    </main>
  );
}
