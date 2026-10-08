import Link from "next/link";
import { as, crmContext, searchText } from "@/lib/crm-server";
import { searchIDs } from "@/lib/crm-search";
import { activityKindLabel, money } from "@/lib/crm";
import { formatDate } from "@/lib/crm-server";
import { ClientLink, ClientStage, DealStage, DocumentStatus, Empty, Head } from "@/components/crm/parts";
export const metadata = { title: "Recherche" };
type Search = Promise<Record<string, string | string[] | undefined>>;
// One query across companies, contacts, deals and documents (accents and small typos tolerated).
export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const q = searchText((await searchParams).q);
  const ctx = await crmContext();
  const [clientIDs, contactIDs, dealIDs, documentIDs, activityIDs] = q
    ? await Promise.all([searchIDs("clients", q, 20), searchIDs("contacts", q, 20), searchIDs("deals", q, 20), searchIDs("documents", q, 20), searchIDs("activities", q, 20)])
    : [[], [], [], [], []];
  // Keeps the relevance order computed in SQL.
  const ordered = <T extends { id: number }>(docs: T[], ids: number[]) => ids.map((i) => docs.find((d) => d.id === i)).filter(Boolean) as T[];
  const find = <C extends "clients" | "crm-contacts" | "crm-deals" | "crm-documents" | "crm-activities">(collection: C, ids: number[]) =>
    ids.length
      ? ctx.payload.find({ collection, where: { id: { in: ids } }, pagination: false, depth: 1, populate: { clients: { name: true } }, ...as(ctx) }).then((r) => ordered(r.docs, ids))
      : Promise.resolve([]);
  const [clients, contacts, deals, documents, activities] = await Promise.all([
    find("clients", clientIDs), find("crm-contacts", contactIDs), find("crm-deals", dealIDs), find("crm-documents", documentIDs), find("crm-activities", activityIDs),
  ]);
  const total = clients.length + contacts.length + deals.length + documents.length + activities.length;
  return (
    <>
      <Head title="Recherche" eyebrow={q ? `${total} résultat${total > 1 ? "s" : ""} pour « ${q} »` : "Entreprises, contacts, opportunités, devis, factures et activités (notes comprises)"} />
      <form className="crm-filters" role="search">
        <input name="q" type="search" defaultValue={q} autoFocus placeholder="Nom, email, téléphone, ville, numéro de facture…" aria-label="Rechercher" />
        <button className="crm-btn">Rechercher</button>
      </form>
      <p className="crm-hint">Les accents et les majuscules sont ignorés, et une petite faute de frappe est tolérée (« minstere » trouve « Ministère »).</p>
      {q && total === 0 && <Empty>Aucun résultat.</Empty>}
      <div className="crm-cols">
        {clients.length > 0 && (
          <section className="crm-card"><h2>Entreprises</h2><ul className="crm-list">
            {clients.map((c) => <li key={c.id}><Link href={`/crm/clients/${c.id}`}>{c.name}</Link><small><ClientStage stage={c.stage} /> {[c.city, c.phone, c.email].filter(Boolean).join(" · ")}</small></li>)}
          </ul></section>
        )}
        {contacts.length > 0 && (
          <section className="crm-card"><h2>Contacts</h2><ul className="crm-list">
            {contacts.map((c) => <li key={c.id}><Link href={`/crm/contacts/${c.id}`}>{c.name}</Link><small><ClientLink client={c.client} /> {[c.jobTitle, c.phone, c.email].filter(Boolean).join(" · ")}</small></li>)}
          </ul></section>
        )}
        {deals.length > 0 && (
          <section className="crm-card"><h2>Opportunités</h2><ul className="crm-list">
            {deals.map((d) => <li key={d.id}><Link href={`/crm/opportunites/${d.id}`}>{d.title}</Link><small><ClientLink client={d.client} /> · <DealStage stage={d.stage} /> · {money(d.amount)}</small></li>)}
          </ul></section>
        )}
        {documents.length > 0 && (
          <section className="crm-card"><h2>Devis et factures</h2><ul className="crm-list">
            {documents.map((d) => <li key={d.id}><Link href={`/crm/documents/${d.id}`}>{d.number ?? "Brouillon"} — {d.title}</Link><small><ClientLink client={d.client} /> · <DocumentStatus doc={d} /> · {money(d.total)}</small></li>)}
          </ul></section>
        )}
        {activities.length > 0 && (
          <section className="crm-card"><h2>Activités</h2><ul className="crm-list">
            {activities.map((a) => <li key={a.id}><Link href={`/crm/activites/${a.id}`}>{a.subject}</Link><small>{activityKindLabel(a.kind)} · <ClientLink client={a.client} /> · {formatDate(a.dueAt ?? a.createdAt)}{a.details ? ` · ${a.details.slice(0, 120)}${a.details.length > 120 ? "…" : ""}` : ""}</small></li>)}
          </ul></section>
        )}
      </div>
    </>
  );
}
