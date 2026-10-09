import type { contactFromCopy } from '@/lib/contact-details';
import type { Locale } from '@/lib/locale';
import { tr as translate } from '@/lib/i18n';
export function ContactMap({details,texts,locale='fr'}:{details:ReturnType<typeof contactFromCopy>;texts:Record<string,string>;locale?:Locale}) {
  const tr=(text:string)=>translate(locale,text);
  const legacyNote = 'La carte recherche l’adresse indiquée. Confirmez la résidence avec nous avant votre déplacement.';
  const legacySearch = 'Rechercher cette adresse dans Google Maps';
  const note = texts['map-note'] && texts['map-note'] !== legacyNote ? texts['map-note'] : 'Le repère correspond aux coordonnées fournies pour nous trouver.';
  const search = texts['map-search'] && texts['map-search'] !== legacySearch ? texts['map-search'] : 'Ouvrir ce repère dans Google Maps';
  return <section className="section contact-map-section" id="nous-trouver" aria-labelledby="map-heading"><div className="container">
    <div className="map-heading"><div><p className="eyebrow">{tr(texts['map-label']??'Nous trouver')}</p><h2 id="map-heading">{tr(texts['map-title']??'Notre adresse.')}</h2><address>{details.address}</address></div>
      <a className="button navy" href={details.directions} target="_blank" rel="noopener noreferrer">{tr(texts['map-directions']??'Ouvrir l’itinéraire')} <span aria-hidden="true">↗</span></a>
    </div>
    <iframe src={locale==='en'?`${details.mapEmbed}&hl=en`:details.mapEmbed} title={tr("Repère de 5/Sync IT sur Google Maps")} loading="lazy" referrerPolicy="no-referrer" allowFullScreen />
    <div className="map-note"><p>{tr(note)}</p><a href={details.mapSearch} target="_blank" rel="noopener noreferrer">{tr(search)} ↗</a></div>
  </div></section>;
}
