import Link from "next/link";
import type { Where } from "payload";
import { as, crmContext, formatDate } from "@/lib/crm-server";
import { activeProspectStages, activityKindLabel, prospectStages } from "@/lib/crm";
import { searchWhere } from "@/lib/crm-search";
import { moveProspect } from "../actions";
import { DragBoard, Submit } from "@/components/crm/client";
import { Flash, Head, param } from "@/components/crm/parts";
export const metadata = { title: "Suivi commercial" };
type Search = Promise<Record<string, string | string[] | undefined>>;
// Cards shown per column; the rest is one click away in the companies list.
const PER_COLUMN = 40;
// Commercial follow-up of the companies, one card each, independent of deals:
// À contacter → … → Devis envoyé, plus « En attente » (no budget yet). Gagné / Perdu close it.
export default async function FollowUpBoard({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const { payload } = ctx;
  const owner = Number(param(search, "responsable")) || null;
  const q = param(search, "q").trim().slice(0, 80);
  const unplanned = param(search, "sans-action") === "1";
  const and: Where[] = [{ or: [{ pipeline: { in: [...activeProspectStages] } }, { pipeline: { exists: false } }] }];
  if (owner) and.push({ owner: { equals: owner } });
  if (q) and.push(await searchWhere("clients", q));
  const [clients, planned, admins] = await Promise.all([
    payload.find({
      collection: "clients",
      where: { and },
      sort: "name",
      pagination: false,
      depth: 1,
      select: { name: true, pipeline: true, pipelineAt: true, city: true, sector: true, owner: true },
      populate: { admins: { name: true, email: true } },
      ...as(ctx),
    }),
    payload.find({
      collection: "crm-activities",
      where: { done: { equals: false }, dueAt: { exists: true } },
      sort: "dueAt",
      pagination: false,
      depth: 0,
      select: { client: true, kind: true, subject: true, dueAt: true },
      ...as(ctx),
    }),
    payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) }),
  ]);
  // Soonest open dated action of each company.
  const next = new Map<unknown, (typeof planned.docs)[number]>();
  for (const a of planned.docs) if (!next.has(a.client)) next.set(a.client, a);
  const now = Date.now();
  const cards = clients.docs.filter((c) => !unplanned || !next.has(c.id));
  // Late actions first, then by date, companies without an action last.
  const due = (id: number) => (next.get(id)?.dueAt ? new Date(next.get(id)!.dueAt!).getTime() : Infinity);
  const params = new URLSearchParams();
  if (owner) params.set("responsable", String(owner));
  if (q) params.set("q", q);
  if (unplanned) params.set("sans-action", "1");
  const back = `/crm/suivi${params.size ? `?${params}` : ""}`;
  const withoutAction = clients.docs.filter((c) => !next.has(c.id)).length;
  return (
    <>
      <Head title="Suivi commercial" eyebrow={`${clients.docs.length} entreprise${clients.docs.length > 1 ? "s" : ""} en cours · ${withoutAction} sans prochaine action`}>
        <Link className="crm-btn crm-btn--ghost" href="/crm/clients?etape=won">Gagnées</Link>
        <Link className="crm-btn crm-btn--ghost" href="/crm/clients?etape=lost">Perdues</Link>
      </Head>
      <Flash search={search} />
      <form className="crm-filters" role="search">
        <input name="q" type="search" defaultValue={q} placeholder="Entreprise, ville, secteur…" aria-label="Rechercher" />
        <select name="responsable" defaultValue={owner ?? ""} aria-label="Responsable">
          <option value="">Tous les responsables</option>
          {admins.docs.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
        </select>
        <label className="crm-check"><input type="checkbox" name="sans-action" value="1" defaultChecked={unplanned} /> Sans prochaine action</label>
        <button className="crm-btn crm-btn--ghost">Afficher</button>
      </form>
      <DragBoard stages={prospectStages} lostConfirm="Classer cette entreprise en « Perdu » ? La raison vous sera demandée sur sa fiche.">
        <p className="crm-hint">Glissez une carte (au doigt : par sa poignée ⠿) vers une autre étape, ou sur « Gagné » / « Perdu ». Au clavier : poignée, Entrée, flèches, Entrée. La liste de la carte puis « OK » marche aussi. Le détail d’un échange et la prochaine action se notent sur la fiche.</p>
        <div className="crm-board crm-board--follow">
          {activeProspectStages.map((stage) => {
            const label = prospectStages.find(([v]) => v === stage)![1];
            const column = cards
              .filter((c) => (c.pipeline ?? "to-contact") === stage)
              .sort((a, b) => due(a.id) - due(b.id) || a.name.localeCompare(b.name, "fr"));
            return (
              <section key={stage} id={`etape-${stage}`} className="crm-board__col" aria-label={label} data-stage={stage}>
                <header>
                  <h2>{label}</h2>
                  <span>{column.length}</span>
                </header>
                {column.slice(0, PER_COLUMN).map((c) => {
                  const a = next.get(c.id);
                  const late = a?.dueAt && new Date(a.dueAt).getTime() < now;
                  return (
                    <article key={c.id} className="crm-deal" draggable data-deal={c.id}>
                      <div className="crm-deal__top">
                        <Link href={`/crm/clients/${c.id}`} draggable={false}><strong>{c.name}</strong></Link>
                        <button type="button" className="crm-deal__handle" data-handle
                          aria-label={`Déplacer « ${c.name} » : Entrée pour saisir, flèches pour choisir l’étape, Entrée pour déposer`}>
                          <span aria-hidden="true">⠿</span>
                        </button>
                      </div>
                      {(c.sector || c.city) && <small className="crm-sub">{[c.sector, c.city].filter(Boolean).join(" · ")}</small>}
                      <div className="crm-deal__meta">
                        {a ? (
                          <span className={late ? "crm-late" : ""}>{activityKindLabel(a.kind)} {formatDate(a.dueAt)}</span>
                        ) : (
                          <Link className="crm-late" href={`/crm/clients/${c.id}#suivi`} draggable={false}>Aucune action prévue</Link>
                        )}
                      </div>
                      {a && <small className="crm-sub">{a.subject}</small>}
                      {c.owner && typeof c.owner === "object" && <small className="crm-sub">{c.owner.name || c.owner.email}</small>}
                      <form action={moveProspect} className="crm-deal__move">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="back" value={back} />
                        <select name="stage" defaultValue={c.pipeline ?? "to-contact"} aria-label={`Étape de ${c.name}`}>
                          {prospectStages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <Submit className="crm-btn crm-btn--small">OK</Submit>
                      </form>
                    </article>
                  );
                })}
                {column.length > PER_COLUMN && (
                  <Link className="crm-more" href={`/crm/clients?etape=${stage}`}>+ {column.length - PER_COLUMN} autres →</Link>
                )}
              </section>
            );
          })}
        </div>
        <div className="crm-dropzones">
          <div className="crm-dropzone crm-dropzone--won" data-stage="won">Déposer ici : Gagné</div>
          <div className="crm-dropzone crm-dropzone--lost" data-stage="lost">Déposer ici : Perdu</div>
        </div>
      </DragBoard>
    </>
  );
}
