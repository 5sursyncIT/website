import Link from 'next/link';
import type { Project } from '@/lib/showcase';
import { type Locale, localePath } from '@/lib/locale';
import { tr as translate } from '@/lib/i18n';
export function ProjectsSection({projects, title, overview = false, locale = 'fr'}: {
  projects: Project[]; title: string; overview?: boolean; locale?: Locale;
}) {
  const tr = (text: string) => translate(locale, text);
  if (!projects.length) return null;
  return <section className="section projects-section" id="nos-realisations-et-projets" aria-labelledby="projects-heading">
    <div className="container">
      <div className="projects-heading">
        <div><p className="eyebrow">5/Sync IT</p><h2 id="projects-heading">{title}</h2></div>
        {overview && <Link className="projects-link" href={localePath(locale, "/realisations#nos-realisations-et-projets")}>{tr("Explorer nos réalisations")} <span aria-hidden="true">↗</span></Link>}
      </div>
      <div className="projects-grid">
        {projects.map(project => <article className="project-card" key={project.id}>
          <div className={`project-logo ${project.logoClass}`}>
            {project.logo
              ? <img src={project.logo.src} alt={project.logo.alt ? tr(project.logo.alt) : `Logo ${project.name}`} loading="lazy" decoding="async" />
              : <span className="project-text-reference">{project.name}</span>}
          </div>
          <div className="project-card-top"><span className="project-country">{tr(project.country)}</span><span className={`project-status ${project.status}`}>{tr(project.statusLabel)}</span></div>
          <h3>{tr(project.name)}</h3>
          <p>{tr(project.mission)}</p>
        </article>)}
      </div>
    </div>
  </section>;
}
