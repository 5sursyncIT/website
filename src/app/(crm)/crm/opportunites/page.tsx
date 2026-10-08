import Link from "next/link";
import { as, crmContext, formatDate } from "@/lib/crm-server";
import { dealStages, money, openDealStages, weighted } from "@/lib/crm";
import { moveDeal } from "../actions";
import { DragBoard, Submit } from "@/components/crm/client";
import { ClientLink, DealForm, DealRows, Flash, Head, param } from "@/components/crm/parts";
export const metadata = { title: "Opportunités" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function Deals({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const { payload } = ctx;
  const owner = Number(param(search, "responsable")) || null;
  const closedView = param(search, "vue") === "conclues";
  const [deals, clients, contacts, admins] = await Promise.all([
    payload.find({
      collection: "crm-deals",
      where: {
        and: [
          { stage: closedView ? { in: ["won", "lost"] } : { in: [...openDealStages] } },
          ...(owner ? [{ owner: { equals: owner } }] : []),
        ],
      },
      sort: closedView ? "-closedAt" : "expectedClose",
      // The board shows every open deal; closed ones are capped to the latest 200.
      ...(closedView ? { limit: 200 } : { pagination: false }),
      depth: 1,
      populate: { clients: { name: true }, admins: { name: true, email: true } },
      ...as(ctx),
    }),
    payload.find({ collection: "clients", where: { stage: { not_equals: "inactive" } }, sort: "name", pagination: false, depth: 0, select: { name: true }, ...as(ctx) }),
    payload.find({ collection: "crm-contacts", sort: "name", pagination: false, depth: 1, select: { name: true, client: true }, populate: { clients: { name: true } }, ...as(ctx) }),
    payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) }),
  ]);
  const back = `/crm/opportunites${owner ? `?responsable=${owner}` : ""}`;
  const now = Date.now();
  return (
    <>
      <Head title="Opportunités" eyebrow={closedView ? "Affaires conclues" : `${deals.docs.length} en cours · ${money(deals.docs.reduce((s, d) => s + (d.amount || 0), 0))} · pondéré ${money(weighted(deals.docs))}`}>
        <a className="crm-btn crm-btn--ghost" href="/crm/export/opportunites">Exporter (CSV)</a>
        <a className="crm-btn" href="#nouvelle">+ Nouvelle opportunité</a>
      </Head>
      <Flash search={search} />
      <form className="crm-filters">
        <select name="responsable" defaultValue={owner ?? ""} aria-label="Responsable">
          <option value="">Tous les responsables</option>
          {admins.docs.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
        </select>
        <select name="vue" defaultValue={closedView ? "conclues" : ""} aria-label="Vue">
          <option value="">En cours (pipeline)</option>
          <option value="conclues">Gagnées et perdues</option>
        </select>
        <button className="crm-btn crm-btn--ghost">Afficher</button>
      </form>
      {closedView ? (
        <section className="crm-card"><DealRows deals={deals.docs} showClient /></section>
      ) : (
        <DragBoard>
        <p className="crm-hint">Glissez une carte (au doigt : par sa poignée ⠿) vers une autre colonne, ou sur « Gagnée » / « Perdue ». Au clavier : poignée, Entrée, flèches, Entrée. La liste de la carte puis « OK » marche aussi.</p>
        <div className="crm-board">
          {openDealStages.map((stage) => {
            const column = deals.docs.filter((d) => d.stage === stage);
            const label = dealStages.find(([v]) => v === stage)![1];
            return (
              <section key={stage} id={`etape-${stage}`} className="crm-board__col" aria-label={label} data-stage={stage}>
                <header>
                  <h2>{label}</h2>
                  <span>{column.length} · {money(column.reduce((s, d) => s + (d.amount || 0), 0))}</span>
                </header>
                {column.map((d) => {
                  const late = d.expectedClose && new Date(d.expectedClose).getTime() < now;
                  return (
                    <article key={d.id} className="crm-deal" draggable data-deal={d.id}>
                      <div className="crm-deal__top">
                        <Link href={`/crm/opportunites/${d.id}`} draggable={false}><strong>{d.title}</strong></Link>
                        <button type="button" className="crm-deal__handle" data-handle
                          aria-label={`Déplacer « ${d.title} » : Entrée pour saisir, flèches pour choisir la colonne, Entrée pour déposer`}>
                          <span aria-hidden="true">⠿</span>
                        </button>
                      </div>
                      <small><ClientLink client={d.client} /></small>
                      <div className="crm-deal__meta">
                        <span>{money(d.amount)}</span>
                        <span>{d.probability ?? 0} %</span>
                        <span className={late ? "crm-late" : ""}>{d.expectedClose ? formatDate(d.expectedClose) : "Sans date"}</span>
                      </div>
                      {d.owner && typeof d.owner === "object" && <small className="crm-sub">{d.owner.name || d.owner.email}</small>}
                      <form action={moveDeal} className="crm-deal__move">
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="back" value={back} />
                        <select name="stage" defaultValue={d.stage} aria-label={`Étape de ${d.title}`}>
                          {dealStages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <Submit className="crm-btn crm-btn--small">OK</Submit>
                      </form>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
        <div className="crm-dropzones">
          <div className="crm-dropzone crm-dropzone--won" data-stage="won">Déposer ici : Gagnée</div>
          <div className="crm-dropzone crm-dropzone--lost" data-stage="lost">Déposer ici : Perdue</div>
        </div>
        </DragBoard>
      )}
      <section className="crm-card" id="nouvelle">
        <h2>Nouvelle opportunité</h2>
        {clients.docs.length ? (
          <DealForm
            clients={clients.docs}
            contacts={contacts.docs}
            admins={admins.docs}
          />
        ) : (
          <p className="crm-empty">Créez d’abord une <Link href="/crm/clients/nouveau">entreprise</Link>.</p>
        )}
      </section>
    </>
  );
}
