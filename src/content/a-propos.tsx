import { HeroVideo } from "@/components/HeroVideo";
import type React from "react";
import { ContactForm } from "@/components/ContactForm";
// Founder biography, as revised by Charlie and validated by the owner. Only confirmed facts:
// no degree, no year, no teaching mention until the owner confirms them.
const FOUNDER_BIO: string[] = [
  "Consultant et chef de projet, Papa Youssoupha DIOP accompagne les entreprises et les institutions dans la conception et la mise en œuvre de leurs projets informatiques. À la tête de 5/Sync IT, basée à Dakar, il associe expertise technique et connaissance du terrain pour proposer des solutions adaptées aux besoins et aux moyens de chaque organisation.",
  "Son expérience couvre les infrastructures réseau et systèmes, la virtualisation, la sécurité informatique et le développement d’applications métier. Il intervient également dans des projets de gestion documentaire, de numérisation et de valorisation des archives, avec une attention particulière à la fiabilité des équipements et à la continuité des services.",
  "Ses missions l’ont conduit à accompagner des organisations au Sénégal et dans plusieurs pays africains, notamment en Guinée, en Côte d’Ivoire et en République démocratique du Congo. Il travaille aussi bien avec des entreprises privées qu’avec des collectivités et des institutions publiques.",
  "La formation et la transmission des connaissances occupent une place importante dans sa démarche. Au-delà du déploiement technique, il veille à ce que les équipes puissent s’approprier les outils et les utiliser durablement.",
];
export default function PageAPropos({
  texts = {},
}: {
  texts?: Record<string, string>;
}) {
  const t = (key: string, fallback: string) => texts[key] ?? fallback;
  return (
    <main id="contenu">
      <section className="hero dark motion-hero motion-main about-hero  ">
        <HeroVideo
          poster="/assets/motion/posters/main-a-propos.jpg"
          sources={[{ src: "/assets/motion/videos/main-a-propos.mp4", type: "video/mp4" }]}
          label="Illustration — À propos de 5/Sync IT"
        />
        <div className="container hero-inner">
          <p className="eyebrow">{t("text-0", "À propos de 5/Sync IT")}</p>
          <h1>
            {t("text-1", "La technique au service")}
            <br />
            {t("text-2", " de votre activité.")}
          </h1>
          <div className="short-rule"></div>
          <p className="hero-description">
            {t("text-3", "À Dakar, 5/Sync IT accompagne les entreprises")}
            <br />
            {t("text-4", " dans leurs projets informatiques.")}
          </p>
          <a className="button aqua" href="/contact">
            {t("text-5", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
        <span className="illustration-label">
          {t("text-6", "Visuel d’illustration")}
        </span>
      </section>
      <section className="section ">
        <div className="container">
          <div className="two-col text-split">
            <div>
              <h2>
                {t("text-7", "Un partenaire pour")}
                <br />
                {t("text-8", " vos enjeux informatiques.")}
              </h2>
              <div className="short-rule"></div>
            </div>
            <div>
              <p>
                {t(
                  "text-9",
                  "Réseaux, cloud, solutions métier et développement : nous construisons des réponses adaptées à vos usages et à votre environnement.",
                )}
              </p>
              <p>
                {t(
                  "text-10",
                  "Notre priorité : accompagner les PME et les entreprises privées dans l’organisation et l’évolution de leur informatique.",
                )}
              </p>
              <p className="muted">
                {t(
                  "text-11",
                  "Une expérience également nourrie par des projets institutionnels.",
                )}
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="section founder" aria-labelledby="fondateur">
        <div className="container founder-grid">
          <figure className="founder-photo">
            <picture>
              <source
                type="image/webp"
                srcSet="/assets/equipe/papa-youssoupha-diop-480.webp 480w, /assets/equipe/papa-youssoupha-diop-800.webp 800w"
                sizes="(max-width: 650px) calc(100vw - 40px), 380px"
              />
              <img
                src="/assets/equipe/papa-youssoupha-diop-800.jpg"
                width={800}
                height={993}
                alt="Portrait de Papa Youssoupha Diop, fondateur et gérant de 5/Sync IT"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </figure>
          <div>
            <p className="eyebrow">{t("founder-eyebrow", "Le fondateur")}</p>
            <h2 id="fondateur">{t("founder-name", "Papa Youssoupha DIOP")}</h2>
            <p className="founder-role">{t("founder-role", "Fondateur et gérant de 5/Sync IT")}</p>
            <div className="short-rule"></div>
            {FOUNDER_BIO.map((paragraph, i) => (
              <p key={i} className="founder-bio">{t(`founder-bio-${i + 1}`, paragraph)}</p>
            ))}
          </div>
        </div>
      </section>
      <section className="section pale">
        <div className="container">
          <p className="eyebrow">
            {t("text-12", "Notre manière de travailler.")}
          </p>
          <div
            className="steps "
            style={{ "--count": "3" } as React.CSSProperties}
          >
            <div className="step">
              <span className="number">{"01"}</span>
              <h3>{t("text-13", "Comprendre votre activité")}</h3>
              <p>
                {t("text-14", "Partir de vos besoins et de vos contraintes.")}
              </p>
            </div>
            <div className="step">
              <span className="number">{"02"}</span>
              <h3>{t("text-15", "Choisir avec pragmatisme")}</h3>
              <p>
                {t(
                  "text-16",
                  "Privilégier des solutions utiles et cohérentes.",
                )}
              </p>
            </div>
            <div className="step">
              <span className="number">{"03"}</span>
              <h3>{t("text-17", "Construire dans la durée")}</h3>
              <p>
                {t("text-18", "Préparer la prise en main et les évolutions.")}
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="section ">
        <div className="container">
          <p className="eyebrow">{t("text-19", "Nos expertises")}</p>
          <h2>{t("text-20", "Quatre expertises complémentaires.")}</h2>
          <div className="service-links">
            <a href="/reseaux-cloud">
              {t("text-21", "Réseaux & cloud")}
              <span aria-hidden="true">{"↗"}</span>
            </a>
            <a href="/solutions-metier">
              {t("text-22", "Solutions métier")}
              <span aria-hidden="true">{"↗"}</span>
            </a>
            <a href="/developpement-api">
              {t("text-23", "Développement & API")}
              <span aria-hidden="true">{"↗"}</span>
            </a>
            <a href="/maintenance-support">
              {t("text-24", "Maintenance et support")}
              <span aria-hidden="true">{"↗"}</span>
            </a>
          </div>
        </div>
      </section>
      <section className="cta dark">
        <div className="container cta-inner">
          <div>
            <h2>
              {t("text-25", "Faisons avancer")}
              <br />
              {t("text-26", " votre prochain projet.")}
            </h2>
          </div>
          <a className="button aqua" href="/contact">
            {t("text-27", "Parlons de votre besoin ")}
            <span aria-hidden="true">{"↗"}</span>
          </a>
        </div>
      </section>
    </main>
  );
}
