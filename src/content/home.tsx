import { AfricaInterventions } from '@/components/AfricaInterventions';
import { HeroVideo } from "@/components/HeroVideo";
import { CatalogueSection } from "@/components/CatalogueSection";
import { ProjectsSection } from "@/components/ProjectsSection";
import type { Project } from "@/lib/showcase";
import type React from "react";
import { ContactForm } from "@/components/ContactForm";
export default function PageHome({
  texts = {},
  catalogueTexts,
  projects,
  projectsTitle,
}: {
  texts?: Record<string, string>;
  catalogueTexts: Record<string,string>;
  projects: Project[];
  projectsTitle: string;
}) {
  const t = (key: string, fallback: string) => texts[key] ?? fallback;
  return (
    <main id="contenu">
      <section className="hero dark motion-hero  home">
        <HeroVideo poster="/assets/motion/posters/accueil.jpg" sources={[{src:"/assets/motion/videos/accueil.mp4",type:"video/mp4"}]} label="Illustration — Écosystème numérique" />
        <div className="container hero-inner">
          <p className="eyebrow">
            {t("text-0", "Informatique pour les entreprises • Dakar")}
          </p>
          <h1>
            {t("text-1", "Des solutions informatiques")}
            <br className="desktop-break" />
            {t("text-2", " pour faire avancer")}
            <br className="desktop-break" />
            {t("text-3", " votre entreprise")}
          </h1>
          <div className="short-rule"></div>
          <p className="hero-description">
            {t("text-4", "Réseaux, outils métier et développement.")}
            <br />
            {t(
              "text-5",
              " Une expertise technique au service de votre activité.",
            )}
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
          <p className="eyebrow">{t("text-8", "01 / Expertises")}</p>
          <h2>{t("text-9", "Une expertise, quatre leviers.")}</h2>
          <div className="service-grid ">
            <a className="service-item" href="/reseaux-cloud">
              <span className="number">{"01"}</span>
              <div>
                <h3>{t("text-10", "Réseaux & cloud")}</h3>
                <p>
                  {t("text-11", "Connecter et structurer votre environnement.")}
                </p>
              </div>
              <span aria-hidden="true">{"↗"}</span>
            </a>
            <a className="service-item" href="/solutions-metier">
              <span className="number">{"02"}</span>
              <div>
                <h3>{t("text-12", "Solutions métier")}</h3>
                <p>{t("text-13", "Des outils adaptés à vos processus.")}</p>
              </div>
              <span aria-hidden="true">{"↗"}</span>
            </a>
            <a className="service-item" href="/developpement-api">
              <span className="number">{"03"}</span>
              <div>
                <h3>{t("text-14", "Développement & API")}</h3>
                <p>{t("text-15", "Créer et connecter vos applications.")}</p>
              </div>
              <span aria-hidden="true">{"↗"}</span>
            </a>
            <a className="service-item" href="/maintenance-support">
              <span className="number">{"04"}</span>
              <div>
                <h3>{t("text-16", "Maintenance et support")}</h3>
                <p>
                  {t("text-17", "Accompagner votre informatique au quotidien.")}
                </p>
              </div>
              <span aria-hidden="true">{"↗"}</span>
            </a>
          </div>
        </div>
      </section>
      <CatalogueSection texts={catalogueTexts} overview />
      <section className="section pale">
        <div className="container">
          <p className="eyebrow">{t("text-18", "02 / Réalisations")}</p>
          <h2>{t("text-19", "Du besoin à la solution.")}</h2>
          <div className="project-list">
            <a href="/realisations#groupe-hage">
              <span className="project-category">
                {t("text-20", "Infrastructure")}
              </span>
              <h3>{t("text-21", "Groupe Hage")}</h3>
              <span>{t("text-22", "Réseau Wi-Fi")}</span>
              <span aria-hidden="true">{"↗"}</span>
            </a>
            <a href="/realisations#harmattan">
              <span className="project-category">{t("text-23", "Web")}</span>
              <h3>{t("text-24", "Harmattan Sénégal")}</h3>
              <span>{t("text-25", "Site vitrine")}</span>
              <span aria-hidden="true">{"↗"}</span>
            </a>
          </div>
        </div>
      </section>
      <ProjectsSection projects={projects} title={projectsTitle} overview />
      <AfricaInterventions texts={texts} />
      <section className="cta">
        <div className="container cta-inner">
          <div>
            <p className="eyebrow">{t("text-26", "03 / Contact")}</p>
            <h2>
              {t("text-27", "Votre prochain projet")}
              <br />
              {t("text-28", " commence ici.")}
            </h2>
          </div>
          <a className="button navy" href="/contact">
            {t("text-29", "Prendre contact ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
    </main>
  );
}
