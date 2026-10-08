import { HeroVideo } from "@/components/HeroVideo";
import { ProjectsSection } from "@/components/ProjectsSection";
import {
  builtinIllustrations,
  type CaseStudy,
  type Project,
} from "@/lib/showcase";
import type React from "react";
import { ContactForm } from "@/components/ContactForm";
export default function PageRealisations({
  texts = {},
  projects,
  projectsTitle,
  caseStudies,
}: {
  texts?: Record<string, string>;
  projects: Project[];
  projectsTitle: string;
  caseStudies: CaseStudy[];
}) {
  const featured = caseStudies.filter(c=>c.image || c.illustration);
  const historical = caseStudies.filter(c=>!c.image && !c.illustration);
  const t = (key: string, fallback: string) => texts[key] ?? fallback;
  return (
    <main id="contenu">
      <section className="hero dark motion-hero motion-main compact ">
        <HeroVideo
          poster="/assets/motion/posters/main-realisations.jpg"
          sources={[{ src: "/assets/motion/videos/main-realisations.mp4", type: "video/mp4" }]}
          label="Illustration — Réalisations et projets"
        />
        <div className="container hero-inner">
          <p className="eyebrow">{t("text-0", "Nos réalisations")}</p>
          <h1>{t("text-1", "Du besoin à la solution.")}</h1>
          <div className="short-rule"></div>
          <p className="hero-description">
            {t("text-2", "Des projets d’infrastructure et de développement")}
            <br />
            {t("text-3", " au service de l’activité.")}
          </p>
        </div>
        <span className="illustration-label">
          {t("text-4", "Visuel d’illustration")}
        </span>
      </section>
      <ProjectsSection projects={projects} title={projectsTitle} />
      {featured.length > 0 && (
        <section className="section cases">
          <div className="container">
            {featured.map((c, index) => {
              const visual = (
                <figure>
                  <CaseVisual study={c} />
                  {!c.image && (
                    <figcaption>Illustration du domaine d’intervention</figcaption>
                  )}
                </figure>
              );
              const text = (
                <div>
                  {c.category && <p className="eyebrow">{c.category}</p>}
                  <h2>{c.client}</h2>
                  <div className="short-rule"></div>
                  <h3>{c.project}</h3>
                  <p>{c.summary}</p>
                  {c.tags.length > 0 && (
                    <div className="tags">
                      {c.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
              const reverse = index % 2 === 1;
              return (
                <article
                  className={reverse ? "case-study reverse" : "case-study"}
                  id={c.anchor}
                  key={c.id}
                >
                  {reverse ? <>{text}{visual}</> : <>{visual}{text}</>}
                </article>
              );
            })}
          </div>
        </section>
      )}
      {historical.length > 0 && <section className="section historical-section" id="references-historiques" aria-labelledby="historical-heading"><div className="container">
        <p className="eyebrow">Références historiques</p>
        <h2 id="historical-heading">{t("historical-heading", "D’autres missions documentées.")}</h2>
        <p className="historical-intro">{t("historical-intro", "Des références publiées sur notre précédent site, replacées dans leur contexte.")}</p>
        <div className="historical-grid">{historical.map(c=><article className="historical-card" id={c.anchor} key={c.id}>
          {c.category&&<p className="eyebrow">{c.category}</p>}<h3>{c.client}</h3><h4>{c.project}</h4><p>{c.summary}</p>
          {!!c.tags.length&&<div className="tags">{c.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
        </article>)}</div>
      </div></section>}
      <section className="section pale">
        <div className="container">
          <div className="two-col">
            <div>
              <h2>
                {t("text-19", "Chaque projet")}
                <br />
                {t("text-20", " commence par vos usages.")}
              </h2>
              <div className="short-rule"></div>
              <p>
                {t(
                  "text-21",
                  "Comprendre le contexte, choisir les bons outils et construire une réponse adaptée.",
                )}
              </p>
            </div>
            <div className="principles">
              <div>
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
                <h3>{t("text-22", "Écoute")}</h3>
              </div>
              <div>
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
                <h3>{t("text-23", "Conception")}</h3>
              </div>
              <div>
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
                  <path d="m3 38 13-15 10 9L44 9M30 9h14v14"></path>
                </svg>
                <h3>{t("text-24", "Mise en œuvre")}</h3>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="cta ">
        <div className="container cta-inner">
          <div>
            <h2>{t("text-25", "Parlons de votre prochain projet.")}</h2>
          </div>
          <a className="button navy" href="/contact">
            {t("text-26", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
    </main>
  );
}

function CaseVisual({ study }: { study: CaseStudy }) {
  if (study.image)
    return (
      <div className="crop case-photo">
        <img src={study.image.src} alt={study.image.alt} loading="lazy" />
      </div>
    );
  const builtin = builtinIllustrations[study.illustration ?? ""];
  if (!builtin) return null;
  return (
    <div
      className="crop "
      role="img"
      aria-label="Illustration du domaine d’intervention"
      style={{ aspectRatio: builtin.ratio } as React.CSSProperties}
    >
      <img
        src="/assets/07_Realisations.webp"
        loading="lazy"
        decoding="async"
        alt=""
        style={builtin.img as React.CSSProperties}
        draggable="false"
      />
    </div>
  );
}
