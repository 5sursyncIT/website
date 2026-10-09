import { HeroVideo } from "@/components/HeroVideo";
import type React from "react";
import { type Locale, localePath } from "@/lib/locale";
import { tr as translate } from "@/lib/i18n";
import { ContactForm } from "@/components/ContactForm";
export default function PageServices({
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
      <section className="hero dark motion-hero motion-main  services-hero">
        <HeroVideo locale={locale}
          poster="/assets/motion/posters/main-services.jpg"
          sources={[{ src: "/assets/motion/videos/main-services.mp4", type: "video/mp4" }]}
          label={tr("Illustration — Services et expertises")}
        />
        <div className="container hero-inner">
          <p className="eyebrow">{t("text-0", "Nos services")}</p>
          <h1>
            {t("text-1", "Une expertise technique.")}
            <br />
            {t("text-2", " Quatre leviers pour")}
            <br />
            {t("text-3", " votre entreprise.")}
          </h1>
          <div className="short-rule"></div>
          <p className="hero-description">
            {t("text-4", "Des solutions concrètes pour connecter vos équipes,")}
            <br />
            {t(
              "text-5",
              " structurer vos outils et accompagner votre activité.",
            )}
          </p>
          <a className="button aqua" href={lp("/contact")}>
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
          <p className="eyebrow">{t("text-8", "Nos services")}</p>
          <h2>{t("text-9", "De l’infrastructure aux usages.")}</h2>
          <div className="service-grid cards">
            <a className="service-item" href={lp("/reseaux-cloud")}>
              <span className="number">{"01"}</span>
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
              <div>
                <h3>{t("text-10", "Réseaux & cloud")}</h3>
                <p>
                  {t("text-11", "Connecter et structurer votre environnement.")}
                </p>
                <div className="tags">
                  <span>{t("text-12", "Réseaux")}</span>
                  <span>{t("text-13", "Wi-Fi")}</span>
                  <span>{t("text-14", "Cloud")}</span>
                </div>
              </div>
              <span className="discover">
                {t("text-15", "Découvrir le service ")}
                <span aria-hidden="true">{"↗"}</span>
              </span>
            </a>
            <a className="service-item" href={lp("/solutions-metier")}>
              <span className="number">{"02"}</span>
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
              <div>
                <h3>{t("text-16", "Solutions métier")}</h3>
                <p>{t("text-17", "Des outils adaptés à vos processus.")}</p>
                <div className="tags">
                  <span>{t("text-18", "Gestion")}</span>
                  <span>{t("text-19", "Collaboration")}</span>
                  <span>{t("text-20", "Organisation")}</span>
                </div>
              </div>
              <span className="discover">
                {t("text-21", "Découvrir le service ")}
                <span aria-hidden="true">{"↗"}</span>
              </span>
            </a>
            <a className="service-item" href={lp("/developpement-api")}>
              <span className="number">{"03"}</span>
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
              <div>
                <h3>{t("text-22", "Développement & API")}</h3>
                <p>{t("text-23", "Créer et connecter vos applications.")}</p>
                <div className="tags">
                  <span>{t("text-24", "Sites web")}</span>
                  <span>{t("text-25", "Applications")}</span>
                  <span>{t("text-26", "API")}</span>
                </div>
              </div>
              <span className="discover">
                {t("text-27", "Découvrir le service ")}
                <span aria-hidden="true">{"↗"}</span>
              </span>
            </a>
            <a className="service-item" href={lp("/maintenance-support")}>
              <span className="number">{"04"}</span>
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
              <div>
                <h3>{t("text-28", "Maintenance et support")}</h3>
                <p>
                  {t("text-29", "Accompagner votre informatique au quotidien.")}
                </p>
                <div className="tags">
                  <span>{t("text-30", "Maintenance")}</span>
                  <span>{t("text-31", "Assistance")}</span>
                  <span>{t("text-32", "Évolution")}</span>
                </div>
              </div>
              <span className="discover">
                {t("text-33", "Découvrir le service ")}
                <span aria-hidden="true">{"↗"}</span>
              </span>
            </a>
          </div>
        </div>
      </section>
      <section className="section pale">
        <div className="container">
          <p className="eyebrow">{t("text-34", "Notre approche")}</p>
          <h2>
            {t("text-35", "Un accompagnement, du besoin à la mise en service.")}
          </h2>
          <div
            className="steps "
            style={{ "--count": "3" } as React.CSSProperties}
          >
            <div className="step">
              <span className="number">{"01"}</span>
              <h3>{t("text-36", "Comprendre")}</h3>
              <p>
                {t("text-37", "Vos usages, vos contraintes, vos priorités.")}
              </p>
            </div>
            <div className="step">
              <span className="number">{"02"}</span>
              <h3>{t("text-38", "Concevoir")}</h3>
              <p>
                {t("text-39", "Une solution adaptée à votre environnement.")}
              </p>
            </div>
            <div className="step">
              <span className="number">{"03"}</span>
              <h3>{t("text-40", "Accompagner")}</h3>
              <p>
                {t("text-41", "Le déploiement, la prise en main et le suivi.")}
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="cta ">
        <div className="container cta-inner">
          <div>
            <h2>{t("text-42", "Quel est votre prochain besoin ?")}</h2>
          </div>
          <a className="button navy" href={lp("/contact")}>
            {t("text-43", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
    </main>
  );
}
