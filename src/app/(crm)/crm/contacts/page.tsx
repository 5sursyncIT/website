import Link from "next/link";
import { as, crmContext, pageNumber, searchText } from "@/lib/crm-server";
import { searchWhere } from "@/lib/crm-search";
import { ClientLink, ContactForm, Empty, Flash, Head, Pager } from "@/components/crm/parts";
export const metadata = { title: "Contacts" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function Contacts({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const q = searchText(search.q);
  const [result, clients] = await Promise.all([
    ctx.payload.find({
      collection: "crm-contacts",
      where: q ? await searchWhere("contacts", q) : undefined,
      sort: "name",
      page: pageNumber(search.page),
      limit: 25,
      depth: 1,
      populate: { clients: { name: true } },
      ...as(ctx),
    }),
    ctx.payload.find({ collection: "clients", sort: "name", pagination: false, depth: 0, select: { name: true }, ...as(ctx) }),
  ]);
  return (
    <>
      <Head title="Contacts" eyebrow={`${result.totalDocs} interlocuteur${result.totalDocs > 1 ? "s" : ""}`}>
        <a className="crm-btn crm-btn--ghost" href="/crm/export/contacts">Exporter (CSV)</a>
        <a className="crm-btn" href="#nouveau">+ Nouveau contact</a>
      </Head>
      <Flash search={search} />
      <form className="crm-filters" role="search">
        <input name="q" type="search" defaultValue={q} placeholder="Nom, email, téléphone, fonction…" aria-label="Rechercher" />
        <button className="crm-btn crm-btn--ghost">Rechercher</button>
      </form>
      {result.docs.length ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead><tr><th>Nom</th><th>Fonction</th><th>Entreprise</th><th>Téléphone</th><th>Email</th></tr></thead>
            <tbody>
              {result.docs.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/crm/contacts/${c.id}`}><strong>{c.name}</strong></Link>{c.primary && <small className="crm-sub">Interlocuteur principal</small>}</td>
                  <td>{c.jobTitle || "—"}</td>
                  <td><ClientLink client={c.client} /></td>
                  <td>{c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a> : "—"}</td>
                  <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{q ? "Aucun contact ne correspond." : "Aucun contact pour l’instant."}</Empty>
      )}
      <Pager page={result.page ?? 1} totalPages={result.totalPages} base="/crm/contacts" search={search} />
      <section className="crm-card" id="nouveau">
        <h2>Nouveau contact</h2>
        {clients.docs.length ? (
          <ContactForm clients={clients.docs} back="/crm/contacts" />
        ) : (
          <p className="crm-empty">Créez d’abord une <Link href="/crm/clients/nouveau">entreprise</Link>.</p>
        )}
      </section>
    </>
  );
}
