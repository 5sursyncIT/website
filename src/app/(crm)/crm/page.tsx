import Link from "next/link";
import { as, crmContext, formatDate } from "@/lib/crm-server";
import { dealStages, money, openDealStages, weighted } from "@/lib/crm";
import { topicLabel } from "@/lib/contact-topics";
import { relationID } from "@/lib/access";
import { Flash, Head, Timeline, ClientLink } from "@/components/crm/parts";
export const metadata = { title: "Tableau de bord" };
type Search = Promise<Record<string, string | string[] | undefined>>;
export default async function Dashboard({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const { payload } = ctx;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  const [clients, prospects, open, won, lostMonth, due, recent, requests, converted, unpaid] = await Promise.all([
    payload.count({ collection: "clients", where: { stage: { equals: "client" } }, ...as(ctx) }),
    payload.count({ collection: "clients", where: { stage: { equals: "prospect" } }, ...as(ctx) }),
    payload.find({
      collection: "crm-deals",
      where: { stage: { in: [...openDealStages] } },
      pagination: false,
      depth: 1,
      select: { title: true, stage: true, amount: true, probability: true, expectedClose: true, client: true },
      populate: { clients: { name: true } },
      sort: "expectedClose",
      ...as(ctx),
    }),
    payload.find({
      collection: "crm-deals",
      where: { stage: { equals: "won" }, closedAt: { greater_than_equal: monthStart } },
      pagination: false,
      depth: 0,
      select: { amount: true },
      ...as(ctx),
    }),
    payload.count({ collection: "crm-deals", where: { stage: { equals: "lost" }, closedAt: { greater_than_equal: monthStart } }, ...as(ctx) }),
    payload.find({
      collection: "crm-activities",
      where: { done: { equals: false }, dueAt: { less_than: dayEnd } },
      sort: "dueAt",
      limit: 8,
      depth: 1,
      ...as(ctx),
    }),
    payload.find({ collection: "crm-activities", where: { done: { equals: true } }, sort: "-updatedAt", limit: 6, depth: 1, ...as(ctx) }),
    payload.find({
      collection: "contact-requests",
      sort: "-createdAt",
      limit: 30,
      depth: 0,
      select: { name: true, company: true, topic: true, createdAt: true },
      ...as(ctx),
    }),
    payload.find({
      collection: "crm-activities",
      where: { request: { exists: true } },
      pagination: false,
      depth: 0,
      select: { request: true },
      ...as(ctx),
    }),
    payload.find({
      collection: "crm-documents",
      where: { kind: { equals: "invoice" }, status: { equals: "issued" } },
      pagination: false,
      depth: 0,
      select: { balance: true, dueDate: true },
      ...as(ctx),
    }),
  ]);
  const lateInvoices = unpaid.docs.filter((d) => d.dueDate && new Date(d.dueDate) < now).length;
  const done = new Set(converted.docs.map((a) => String(relationID(a.request))));
  const fresh = requests.docs.filter((r) => !done.has(String(r.id)));
  const byStage = openDealStages.map((stage) => {
    const deals = open.docs.filter((d) => d.stage === stage);
    return { stage, label: dealStages.find(([v]) => v === stage)![1], count: deals.length, amount: deals.reduce((s, d) => s + (d.amount || 0), 0) };
  });
  const max = Math.max(1, ...byStage.map((s) => s.amount));
  const wonAmount = won.docs.reduce((s, d) => s + (d.amount || 0), 0);
  const closing = open.docs.filter((d) => d.expectedClose).slice(0, 5);
  const stats = [
    { label: "Clients actifs", value: String(clients.totalDocs), href: "/crm/clients?statut=client" },
    { label: "Prospects", value: String(prospects.totalDocs), href: "/crm/clients?statut=prospect" },
    { label: `Pipeline ouvert (${open.docs.length})`, value: money(open.docs.reduce((s, d) => s + (d.amount || 0), 0)), href: "/crm/opportunites" },
    { label: "Pipeline pondéré", value: money(weighted(open.docs)), href: "/crm/opportunites" },
    { label: `Gagné ce mois (${won.docs.length} gagnée${won.docs.length > 1 ? "s" : ""}, ${lostMonth.totalDocs} perdue${lostMonth.totalDocs > 1 ? "s" : ""})`, value: money(wonAmount), href: "/crm/opportunites?vue=conclues" },
    { label: `À encaisser (${unpaid.docs.length} facture${unpaid.docs.length > 1 ? "s" : ""}${lateInvoices ? `, ${lateInvoices} en retard` : ""})`, value: money(unpaid.docs.reduce((s, d) => s + (d.balance || 0), 0)), href: "/crm/documents?type=invoice&statut=issued", warn: lateInvoices > 0 },
    { label: "Tâches en retard ou du jour", value: String(due.totalDocs), href: "/crm/taches", warn: due.docs.some((a) => a.dueAt && new Date(a.dueAt) < now) },
  ];
  return (
    <>
      <Head title="Tableau de bord" eyebrow="CRM clients">
        <Link className="crm-btn" href="/crm/clients/nouveau">+ Entreprise</Link>
        <Link className="crm-btn crm-btn--ghost" href="/crm/opportunites#nouvelle">+ Opportunité</Link>
      </Head>
      <Flash search={search} />
      <section className="crm-stats" aria-label="Indicateurs">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={`crm-stat${s.warn ? " crm-stat--warn" : ""}`}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </Link>
        ))}
      </section>
      <div className="crm-cols">
        <section className="crm-card">
          <h2>Pipeline par étape</h2>
          <p className="crm-hint">Montant estimé des opportunités ouvertes.</p>
          <ul className="crm-bars">
            {byStage.map((s) => (
              <li key={s.stage}>
                <Link href={`/crm/opportunites#etape-${s.stage}`} className="crm-bars__label">{s.label}</Link>
                <span className="crm-bars__track" title={`${s.label} : ${s.count} opportunité(s), ${money(s.amount)}`}>
                  <span className="crm-bars__fill" style={{ width: `${(s.amount / max) * 100}%` }} />
                </span>
                <span className="crm-bars__value">{money(s.amount)} · {s.count}</span>
              </li>
            ))}
          </ul>
          {closing.length > 0 && (
            <>
              <h3>Prochaines clôtures prévues</h3>
              <ul className="crm-list">
                {closing.map((d) => (
                  <li key={d.id}>
                    <Link href={`/crm/opportunites/${d.id}`}>{d.title}</Link>
                    <small><ClientLink client={d.client} /> · {formatDate(d.expectedClose)} · {money(d.amount)}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="crm-card">
          <h2>À faire</h2>
          <Timeline activities={due.docs} back="/crm" showClient />
          <Link className="crm-more" href="/crm/taches">Toutes les tâches →</Link>
        </section>
        <section className="crm-card">
          <h2>Demandes du site à traiter</h2>
          {fresh.length ? (
            <ul className="crm-list">
              {fresh.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/crm/demandes#demande-${r.id}`}>{r.company || r.name}</Link>
                  <small>{topicLabel(r.topic)} · {formatDate(r.createdAt)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm-empty">Aucune demande récente non convertie.</p>
          )}
          <Link className="crm-more" href="/crm/demandes">Toutes les demandes →</Link>
        </section>
        <section className="crm-card">
          <h2>Dernières activités</h2>
          <Timeline activities={recent.docs} back="/crm" showClient />
        </section>
      </div>
    </>
  );
}
