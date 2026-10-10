import type { CaseStudy } from "@/lib/showcase";
import { type Locale, localePath } from "@/lib/locale";
import { tr as translate } from "@/lib/i18n";
// Case studies relevant to the service being read, with a link to the full project.
// Renders nothing when none of the chosen ones is published.
export function ServiceCases({ cases, locale = "fr" }: { cases: CaseStudy[]; locale?: Locale }) {
  if (!cases.length) return null;
  const tr = (text: string) => translate(locale, text);
  return (
    <section className="section tight" aria-labelledby="realisations-service">
      <div className="container">
        <p className="eyebrow">{tr("Réalisations")}</p>
        <h2 id="realisations-service">{tr("Ce que nous avons déjà livré sur ce sujet")}</h2>
        <div className="service-cases">
          {cases.map((c) => (
            <article key={c.id} className="service-case">
              <p className="eyebrow">{c.category}</p>
              <h3>{c.client}</h3>
              <p className="service-case__project">{c.project}</p>
              <p>{c.summary}</p>
              <a className="text-link" href={localePath(locale, `/realisations#${c.anchor}`)}>
                {tr("Voir le projet")} <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
