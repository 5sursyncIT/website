import Link from "next/link";
import type { Where } from "payload";
import { as, crmContext, pageNumber, searchText } from "@/lib/crm-server";
import { searchWhere } from "@/lib/crm-search";
import { creditStatuses, documentKinds, invoiceStatuses, money, quoteStatuses } from "@/lib/crm";
import { DocumentRows, Flash, Head, Pager, param } from "@/components/crm/parts";
export const metadata = { title: "Devis et factures" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function Documents({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const q = searchText(search.q);
  const kind = documentKinds.some(([v]) => v === param(search, "type")) ? param(search, "type") : "";
  const statuses = [...quoteStatuses, ...invoiceStatuses, ...creditStatuses];
  const status = statuses.some(([v]) => v === param(search, "statut")) ? param(search, "statut") : "";
  const and: Where[] = [];
  if (kind) and.push({ kind: { equals: kind } });
  if (status) and.push({ status: { equals: status } });
  if (q) and.push(await searchWhere("documents", q));
  const [result, unpaid] = await Promise.all([
    ctx.payload.find({
      collection: "crm-documents",
      where: and.length ? { and } : undefined,
      sort: "-createdAt",
      page: pageNumber(search.page),
      limit: 25,
      depth: 1,
      populate: { clients: { name: true } },
      ...as(ctx),
    }),
    ctx.payload.find({
      collection: "crm-documents",
      where: { kind: { equals: "invoice" }, status: { equals: "issued" } },
      pagination: false,
      depth: 0,
      select: { balance: true, dueDate: true },
      ...as(ctx),
    }),
  ]);
  const now = Date.now();
  const late = unpaid.docs.filter((d) => d.dueDate && new Date(d.dueDate).getTime() < now);
  return (
    <>
      <Head title="Devis et factures" eyebrow={`À encaisser : ${money(unpaid.docs.reduce((s, d) => s + (d.balance || 0), 0))} sur ${unpaid.docs.length} facture${unpaid.docs.length > 1 ? "s" : ""}${late.length ? ` · ${late.length} en retard` : ""}`}>
        <a className="crm-btn crm-btn--ghost" href="/crm/export/documents">Exporter (CSV)</a>
        <Link className="crm-btn crm-btn--ghost" href="/crm/documents/nouveau?type=facture">+ Facture</Link>
        <Link className="crm-btn" href="/crm/documents/nouveau?type=devis">+ Devis</Link>
      </Head>
      <Flash search={search} />
      <form className="crm-filters" role="search">
        <input name="q" type="search" defaultValue={q} placeholder="Numéro ou objet…" aria-label="Rechercher" />
        <select name="type" defaultValue={kind} aria-label="Type">
          <option value="">Tous les documents</option>
          {documentKinds.map(([v, l]) => <option key={v} value={v}>{v === "quote" ? l : `${l}s`}</option>)}
        </select>
        <select name="statut" defaultValue={status} aria-label="Statut">
          <option value="">Tous les statuts</option>
          <optgroup label="Devis">{quoteStatuses.map(([v, l]) => <option key={`q${v}`} value={v}>{l}</option>)}</optgroup>
          <optgroup label="Factures">{invoiceStatuses.filter(([v]) => v !== "draft").map(([v, l]) => <option key={`i${v}`} value={v}>{l}</option>)}</optgroup>
          <optgroup label="Avoirs"><option value="issued">Émis</option></optgroup>
        </select>
        <button className="crm-btn crm-btn--ghost">Filtrer</button>
      </form>
      <DocumentRows documents={result.docs} showClient />
      <Pager page={result.page ?? 1} totalPages={result.totalPages} base="/crm/documents" search={search} />
    </>
  );
}
