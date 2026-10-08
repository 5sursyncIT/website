'use client';
import { useEffect, useRef, useState } from 'react';
import geometry from '@/content/africa-geometry.json';
import styles from './AfricaInterventions.module.css';

const countries = [
  { id: 'SEN', name: 'Sénégal' },
  { id: 'CIV', name: 'Côte d’Ivoire' },
  { id: 'GIN', name: 'Guinée' },
  { id: 'GNB', name: 'Guinée-Bissau' },
  { id: 'COD', name: 'République démocratique du Congo' },
  { id: 'COG', name: 'République du Congo', detail: 'Congo-Brazzaville' },
] as const;
type CountryId = typeof countries[number]['id'];
export function AfricaInterventions({ texts = {} }: { texts?: Record<string, string> }) {
  const [selected, setSelected] = useState<CountryId>('SEN');
  const [hovered, setHovered] = useState<CountryId | null>(null);
  const [arrived, setArrived] = useState(false);
  const section = useRef<HTMLElement>(null);
  const active = hovered ?? selected;
  const country = countries.find(c => c.id === active)!;
  const mission = texts[`africa-mission-${active}`]?.trim();
  useEffect(() => {
    if (!section.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setArrived(true); observer.disconnect(); }
    }, { threshold: 0.16 });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  const choose = (id: CountryId) => { setSelected(id); setHovered(null); };
  return <section ref={section} id="interventions-afrique" className={styles.section} data-arrived={arrived} aria-labelledby="africa-heading">
    <div className="container">
      <div className={styles.heading}>
        <h2 id="africa-heading">{texts['africa-title'] ?? 'Nos interventions en Afrique'}</h2>
        <p>{texts['africa-intro'] ?? 'Des interventions au-delà des frontières. Explorez les pays où 5/Sync IT est intervenu.'}</p>
      </div>
      <div className={styles.layout}>
        <div className={styles.map}>
          <svg viewBox={geometry.viewBox} role="group" aria-labelledby="africa-map-title africa-map-description">
            <title id="africa-map-title">Pays d’intervention de 5/Sync IT en Afrique</title>
            <desc id="africa-map-description">Sélectionnez un pays coloré ou utilisez la liste. Les contours représentent les pays, pas des bureaux ou des lieux de projets.</desc>
            {geometry.countries.map(shape => {
              const item = countries.find(c => c.id === shape.id);
              if (!item) return <path key={shape.id} d={shape.path} className={styles.land} aria-hidden="true" />;
              return <path key={shape.id} d={shape.path} className={styles.country}
                data-country={item.id} data-active={active === item.id} data-selected={selected === item.id}
                role="button" tabIndex={0} aria-label={item.name} aria-pressed={selected === item.id} aria-controls="africa-country-detail"
                onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)}
                onFocus={() => choose(item.id)} onClick={() => choose(item.id)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(item.id); } }}>
                <title>{item.name}</title>
              </path>;
            })}
          </svg>
          <div className={styles.legend}><span aria-hidden="true" />{texts['africa-legend'] ?? 'Pays d’intervention'}</div>
          <a className={styles.source} href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Contours : Natural Earth</a>
        </div>
        <div className={styles.explore}>
          <p className={styles.instruction}>{texts['africa-instruction'] ?? 'Choisissez un pays sur la carte ou dans la liste.'}</p>
          <ul className={styles.list} aria-label="Pays d’intervention">
            {countries.map(item => <li key={item.id}>
              <button type="button" data-country={item.id} data-active={active === item.id} aria-pressed={selected === item.id} aria-controls="africa-country-detail"
                onClick={() => choose(item.id)} onFocus={() => choose(item.id)}
                onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)}>
                <span>{item.name}{'detail' in item && <small>{item.detail}</small>}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </button>
            </li>)}
          </ul>
          <div id="africa-country-detail" className={styles.detail}>
            <h3 key={country.id}>{country.name}</h3>
            <p className={styles.detailLabel}>{texts['africa-detail-label'] ?? 'Pays d’intervention'}</p>
            {'detail' in country && <p>{country.detail}</p>}
            {mission && <p className={styles.mission}>{mission}</p>}
          </div>
          <span className={styles.srOnly} role="status">Pays sélectionné : {countries.find(c => c.id === selected)!.name}</span>
        </div>
      </div>
    </div>
  </section>;
}
