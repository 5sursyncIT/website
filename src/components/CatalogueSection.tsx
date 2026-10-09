import Link from 'next/link';
import { catalogueFromCopy } from '@/lib/catalogue';
import { type Locale, localePath } from '@/lib/locale';
import { tr as translate } from '@/lib/i18n';
export function CatalogueSection({texts,overview=false,locale='fr'}:{texts:Record<string,string>;overview?:boolean;locale?:Locale}) {
  const tr=(text:string)=>translate(locale,text);
  const items=catalogueFromCopy(texts).map(p=>({...p,name:tr(p.name),category:tr(p.category),summary:tr(p.summary)}));
  return <section className={`section catalogue-section ${overview?'catalogue-overview':''}`} id="nos-solutions" aria-labelledby="catalogue-heading">
    <div className="container">
      <div className="catalogue-heading"><div><p className="eyebrow">{tr('Solutions 5/Sync IT')}</p><h2 id="catalogue-heading">{tr(texts['catalogue-heading'] ?? 'Six gammes pour vos usages.')}</h2></div>
        {overview&&<Link className="projects-link" href={localePath(locale,"/solutions-metier#nos-solutions")}>{tr("Découvrir nos solutions")} <span aria-hidden="true">↗</span></Link>}
      </div>
      {!overview&&<p className="catalogue-intro">{tr(texts['catalogue-intro'] ?? 'Des solutions à configurer et à intégrer selon votre organisation, vos besoins et votre environnement.')}</p>}
      <div className="catalogue-grid">{items.map(product => <article className="catalogue-card" id={overview?undefined:product.id} key={product.id}>
        <h3>{overview?<Link href={localePath(locale,`/solutions-metier#${product.id}`)}>{product.name}<span aria-hidden="true">↗</span></Link>:product.name}</h3>
        <p className="catalogue-category">{product.category}</p>
        {!overview&&<p className="catalogue-summary">{product.summary}</p>}
      </article>)}</div>
    </div>
  </section>;
}
