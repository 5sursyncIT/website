import Link from "next/link";
import type { Where } from "payload";
import { as, crmContext, formatDate, formatDateTime, pageNumber, searchText } from "@/lib/crm-server";
import { activeProspectStages, clientStages, prospectStages } from "@/lib/crm";
import { searchWhere } from "@/lib/crm-search";
import { ClientStage, Empty, Flash, Head, Pager, ProspectStage, param } from "@/components/crm/parts";
export const metadata = { title: "Entreprises" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function Clients({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const q = searchText(search.q);
  const stage = clientStages.some(([v]) => v === param(search, "statut")) ? param(search, "statut") : "";
  const and: Where[] = [];
  if (stage) and.push({ stage: { equals: stage } });
  const step = param(search, "etape");
  const pipeline = step === "en-cours" || prospectStages.some(([v]) => v === step) ? step : "";
  if (pipeline === "en-cours") and.push({ pipeline: { in: [...activeProspectStages] } });
  else if (pipeline === "to-contact") and.push({ or: [{ pipeline: { equals: pipeline } }, { pipeline: { exists: false } }] });
  else if (pipeline) and.push({ pipeline: { equals: pipeline } });
  // Accents, case and small typos are tolerated (pg_trgm on search_text).
  if (q) and.push(await searchWhere("clients", q));
  const result = await ctx.payload.find({
    collection: "clients",
    where: and.length ? { and } : undefined,
    sort: param(search, "tri") === "recent" ? "-createdAt" : "name",
    page: pageNumber(search.page),
    limit: 25,
    depth: 1,
    select: { name: true, stage: true, pipeline: true, city: true, sector: true, phone: true, email: true, owner: true, createdAt: true },
    populate: { admins: { name: true, email: true } },
    ...as(ctx),
  });
  const ids = result.docs.map((c) => c.id);
  const [deals, contacts, planned] = ids.length
    ? await Promise.all([
        ctx.payload.find({ collection: "crm-deals", where: { client: { in: ids }, stage: { in: ["lead", "qualified", "proposal", "negotiation"] } }, pagination: false, depth: 0, select: { client: true }, ...as(ctx) }),
        ctx.payload.find({ collection: "crm-contacts", where: { client: { in: ids } }, pagination: false, depth: 0, select: { client: true }, ...as(ctx) }),
        ctx.payload.find({ collection: "crm-activities", where: { client: { in: ids }, done: { equals: false }, dueAt: { exists: true } }, sort: "dueAt", pagination: false, depth: 0, select: { client: true, dueAt: true }, ...as(ctx) }),
      ])
    : [{ docs: [] }, { docs: [] }, { docs: [] }];
  const nextAt = (id: number) => planned.docs.find((a) => a.client === id)?.dueAt;
  const now = Date.now();
  const count = (docs: { client: unknown }[], id: number) => docs.filter((d) => d.client === id).length;
  return (
    <>
      <Head title="Entreprises" eyebrow={`${result.totalDocs} fiche${result.totalDocs > 1 ? "s" : ""}`}>
        <Link className="crm-btn crm-btn--ghost" href="/crm/clients/importer">Importer (CSV)</Link>
        <a className="crm-btn crm-btn--ghost" href="/crm/export/clients">Exporter (CSV)</a>
        <Link className="crm-btn" href="/crm/clients/nouveau">+ Nouvelle entreprise</Link>
      </Head>
      <Flash search={search} />
      <form className="crm-filters" role="search">
        <input name="q" type="search" defaultValue={q} placeholder="Nom, email, ville, secteur, téléphone…" aria-label="Rechercher" />
        <select name="statut" defaultValue={stage} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {clientStages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="etape" defaultValue={pipeline} aria-label="Étape commerciale">
          <option value="">Toutes les étapes</option>
          <option value="en-cours">En cours (ni gagné ni perdu)</option>
          {prospectStages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="tri" defaultValue={param(search, "tri")} aria-label="Tri">
          <option value="">Ordre alphabétique</option>
          <option value="recent">Plus récentes</option>
        </select>
        <button className="crm-btn crm-btn--ghost">Filtrer</button>
      </form>
      {result.docs.length ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr><th>Entreprise</th><th>Statut</th><th>Étape</th><th>Prochaine action</th><th>Ville</th><th>Contact</th><th className="num">Contacts</th><th className="num">Opp. ouvertes</th><th>Responsable</th><th>Créée le</th></tr>
            </thead>
            <tbody>
              {result.docs.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/crm/clients/${c.id}`}><strong>{c.name}</strong></Link>{c.sector && <small className="crm-sub">{c.sector}</small>}</td>
                  <td><ClientStage stage={c.stage} /></td>
                  <td><ProspectStage stage={c.pipeline} /></td>
                  <td>{(() => {
                    const at = nextAt(c.id);
                    return at ? <span className={new Date(at).getTime() < now ? "crm-late" : ""}>{formatDateTime(at)}</span> : "—";
                  })()}</td>
                  <td>{c.city || "—"}</td>
                  <td>{c.phone || c.email || "—"}</td>
                  <td className="num">{count(contacts.docs, c.id)}</td>
                  <td className="num">{count(deals.docs, c.id)}</td>
                  <td>{c.owner && typeof c.owner === "object" ? c.owner.name || c.owner.email : "—"}</td>
                  <td>{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{q || stage || pipeline ? "Aucune entreprise ne correspond à ces critères." : "Aucune entreprise. Créez la première ou convertissez une demande du site."}</Empty>
      )}
      <Pager page={result.page ?? 1} totalPages={result.totalPages} base="/crm/clients" search={search} />
    </>
  );
}
