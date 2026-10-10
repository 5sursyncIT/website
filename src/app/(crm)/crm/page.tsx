import Link from "next/link";
import { as, crmContext, formatDate, formatDateTime } from "@/lib/crm-server";
import { activeProspectStages, activityKindLabel, dealStages, money, openDealStages, prospectPriority, prospectStages, weighted } from "@/lib/crm";
import { topicLabel } from "@/lib/contact-topics";
import { relationID } from "@/lib/access";
import { priorityLabel, priorityRank, statusLabel, waitingState } from "@/lib/support";
import { Flash, Head, Timeline, ClientLink, ProspectStage, QuickPlan, param } from "@/components/crm/parts";
export const metadata = { title: "Aujourd’hui" };
type Search = Promise<Record<string, string | string[] | undefined>>;
// Home of the CRM: what has to be done today (actions due, website requests, Support
// tickets, companies in progress without a next action), then the indicators.
export default async function Dashboard({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const ctx = await crmContext();
  const { payload } = ctx;
  const me = ctx.user.id as number;
  const mine = param(search, "pour") === "moi";
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  const [clients, prospects, open, won, lostMonth, due, recent, converted, unpaid, tickets, active, planned, admins] = await Promise.all([
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
      where: { done: { equals: false }, dueAt: { less_than: dayEnd }, ...(mine ? { assignee: { equals: me } } : {}) },
      sort: "dueAt",
      limit: 60,
      depth: 1,
      populate: { clients: { name: true, pipeline: true }, admins: { name: true, email: true } },
      ...as(ctx),
    }),
    payload.find({ collection: "crm-activities", where: { done: { equals: true } }, sort: "-updatedAt", limit: 6, depth: 1, ...as(ctx) }),
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
    // Tickets waiting for the team (full administrators only). Ordered below by triage
    // priority, then by how long the team has owed an answer — not by updatedAt.
    ctx.full ? payload.find({
      collection: "tickets",
      where: { status: { in: ["open", "in-progress"] } },
      pagination: false,
      depth: 1,
      select: { subject: true, status: true, client: true, updatedAt: true, createdAt: true, priority: true },
      populate: { clients: { name: true } },
      ...as(ctx),
    }) : null,
    payload.find({
      collection: "clients",
      where: { or: [{ pipeline: { in: [...activeProspectStages] } }, { pipeline: { exists: false } }], ...(mine ? { owner: { equals: me } } : {}) },
      sort: "name",
      pagination: false,
      depth: 0,
      select: { name: true, pipeline: true, owner: true },
      ...as(ctx),
    }),
    payload.find({
      collection: "crm-activities",
      where: { done: { equals: false }, dueAt: { exists: true } },
      pagination: false,
      depth: 0,
      select: { client: true },
      ...as(ctx),
    }),
    payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) }),
  ]);
  // Untreated website requests. The already converted ones are excluded inside the query,
  // so both the count and the list are global: an old request still waiting is never
  // hidden behind a page of recent, already converted ones. The request itself is never
  // modified (read-only collection), so the conversion activity is what marks it treated.
  const treated = [...new Set(converted.docs.map((a) => relationID(a.request)).filter((v) => v !== null))];
  const requests = await payload.find({
    collection: "contact-requests",
    where: treated.length ? { id: { not_in: treated } } : {},
    sort: "-createdAt",
    limit: 8,
    depth: 0,
    select: { name: true, company: true, topic: true, createdAt: true },
    ...as(ctx),
  });
  const withAction = new Set(planned.docs.map((a) => relationID(a.client)));
  const toPlan = active.docs
    .filter((c) => !withAction.has(c.id))
    .sort((a, b) => prospectPriority(a.pipeline) - prospectPriority(b.pipeline) || a.name.localeCompare(b.name, "fr"));
  const byProspectStage = activeProspectStages.map((stage) => ({
    stage,
    label: prospectStages.find(([v]) => v === stage)![1],
    count: active.docs.filter((c) => (c.pipeline ?? "to-contact") === stage).length,
  }));
  const maxProspects = Math.max(1, ...byProspectStage.map((s) => s.count));
  // Who owes an answer is read from the replies, not from updatedAt: an internal note or
  // a status change bumps updatedAt without anyone having answered the client.
  const replies = tickets?.docs.length
    ? await payload.find({
        collection: "ticket-replies",
        where: { ticket: { in: tickets.docs.map((t) => t.id) } },
        pagination: false,
        depth: 0,
        select: { ticket: true, author: true, createdAt: true },
        ...as(ctx),
      })
    : null;
  // Most urgent first, then the longest wait; answered tickets after the waiting ones.
  const queue = (tickets?.docs ?? [])
    .map((t) => ({ ticket: t, wait: waitingState(t, replies?.docs ?? []) }))
    .sort(
      (a, b) =>
        Number(b.wait.awaiting) - Number(a.wait.awaiting) ||
        priorityRank(a.ticket.priority) - priorityRank(b.ticket.priority) ||
        String(a.wait.since ?? "").localeCompare(String(b.wait.since ?? "")),
    );
  const awaitingTeam = queue.filter((q) => q.wait.awaiting).length;
  const today = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Africa/Dakar" }).format(now);
  const lateInvoices = unpaid.docs.filter((d) => d.dueDate && new Date(d.dueDate) < now).length;
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
      <Head title="Aujourd’hui" eyebrow={today}>
        <Link className="crm-btn" href="/crm/suivi">Suivi commercial</Link>
        <Link className="crm-btn crm-btn--ghost" href="/crm/clients/nouveau">+ Entreprise</Link>
      </Head>
      <Flash search={search} />
      <nav className="crm-tabs" aria-label="Actions affichées">
        <Link href="/crm" aria-current={mine ? undefined : "page"}>Toute l’équipe</Link>
        <Link href="/crm?pour=moi" aria-current={mine ? "page" : undefined}>Mes actions</Link>
      </nav>
      <div className="crm-today">
        <section className="crm-card crm-today__main" aria-labelledby="today-actions">
          <h2 id="today-actions">Actions du jour et en retard <span className="crm-count">{due.totalDocs}</span></h2>
          {due.docs.length ? (
            <ul className="crm-actions">
              {due.docs.map((a) => {
                const client = a.client && typeof a.client === "object" ? a.client : null;
                const late = a.dueAt && new Date(a.dueAt) < now;
                return (
                  <li key={a.id} className={late ? "is-late" : ""}>
                    <div>
                      <span className={`crm-kind crm-kind--${a.kind}`}>{activityKindLabel(a.kind)}</span>{" "}
                      <strong>{a.subject}</strong>
                      <small className="crm-sub">
                        {client ? <Link href={`/crm/clients/${client.id}`}>{client.name}</Link> : "—"}
                        {client && <> · <ProspectStage stage={client.pipeline} /></>}
                        {" · "}<span className={late ? "crm-late" : ""}>{late ? "En retard · " : ""}{formatDateTime(a.dueAt)}</span>
                        {" · "}{a.assignee && typeof a.assignee === "object" ? a.assignee.name || a.assignee.email : "Sans responsable"}
                      </small>
                    </div>
                    {client && (
                      <Link className="crm-btn crm-btn--small" href={`/crm/clients/${client.id}?action=${a.id}#suivi`}>Fait → noter la suite</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="crm-empty">{mine ? "Aucune action prévue pour vous aujourd’hui." : "Aucune action prévue aujourd’hui."}</p>
          )}
          {due.totalDocs > due.docs.length && <Link className="crm-more" href="/crm/taches">Toutes les tâches →</Link>}
        </section>
        <section className="crm-card" aria-labelledby="today-requests">
          <h2 id="today-requests">Nouvelles demandes du site <span className="crm-count">{requests.totalDocs}</span></h2>
          {requests.docs.length ? (
            <ul className="crm-list">
              {requests.docs.map((r) => (
                <li key={r.id}>
                  <Link href={`/crm/demandes#demande-${r.id}`}>{r.company || r.name}</Link>
                  <small>{topicLabel(r.topic)} · {formatDate(r.createdAt)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm-empty">Aucune demande non traitée.</p>
          )}
          <Link className="crm-more" href="/crm/demandes">Toutes les demandes →</Link>
        </section>
        {tickets && <section className="crm-card" aria-labelledby="today-tickets">
          <h2 id="today-tickets">Tickets Support à traiter <span className="crm-count">{tickets.totalDocs}</span></h2>
          {queue.length ? (
            <>
              <p className="crm-hint">
                {awaitingTeam
                  ? `${awaitingTeam} en attente d’une réponse de l’équipe, les plus urgents d’abord.`
                  : "Tous ont reçu une réponse de l’équipe ; en attente du client."}
              </p>
              <ul className="crm-list">
                {queue.slice(0, 10).map(({ ticket: t, wait }) => (
                  <li key={t.id}>
                    <a href={`/admin/collections/tickets/${t.id}`}>{t.subject}</a>
                    <small>
                      <ClientLink client={t.client} /> · {statusLabel(t.status)}
                      {t.priority !== "normal" && <> · <span className={t.priority === "urgent" || t.priority === "high" ? "crm-late" : ""}>Priorité {priorityLabel(t.priority).toLowerCase()}</span></>}
                      {" · "}
                      <span className={wait.awaiting ? "crm-late" : ""}>
                        {wait.awaiting
                          ? `${wait.team ? "sans réponse de l’équipe depuis le" : "jamais répondu, reçu le"} ${formatDateTime(wait.since)}`
                          : `répondu le ${formatDateTime(wait.team)}`}
                      </span>
                    </small>
                  </li>
                ))}
              </ul>
              {queue.length > 10 && <a className="crm-more" href="/admin/collections/tickets">Tous les tickets ↗</a>}
            </>
          ) : (
            <p className="crm-empty">Aucun ticket ouvert ou en cours.</p>
          )}
        </section>}
        <section className="crm-card crm-today__main" aria-labelledby="today-unplanned">
          <h2 id="today-unplanned">Entreprises en cours sans prochaine action <span className="crm-count">{toPlan.length}</span></h2>
          <p className="crm-hint">Les échanges les plus avancés d’abord. Planifiez une action datée avec son responsable ; le détail se note sur la fiche.</p>
          {toPlan.length ? (
            <ul className="crm-actions">
              {toPlan.slice(0, 12).map((c) => (
                <li key={c.id}>
                  <div>
                    <Link href={`/crm/clients/${c.id}#suivi`}><strong>{c.name}</strong></Link>
                    <small className="crm-sub"><ProspectStage stage={c.pipeline} /></small>
                  </div>
                  <QuickPlan client={c} admins={admins.docs} me={me} back={mine ? "/crm?pour=moi" : "/crm"} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm-empty">Toutes les entreprises en cours ont une prochaine action.</p>
          )}
          {toPlan.length > 12 && <Link className="crm-more" href="/crm/suivi?sans-action=1">Les {toPlan.length} entreprises sans action sur le tableau →</Link>}
        </section>
      </div>
      <h2 className="crm-section-title">Indicateurs</h2>
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
          <h2>Suivi commercial par étape</h2>
          <p className="crm-hint">Entreprises en cours{mine ? " dont vous êtes responsable" : ""}.</p>
          <ul className="crm-bars">
            {byProspectStage.map((s) => (
              <li key={s.stage}>
                <Link href={`/crm/suivi#etape-${s.stage}`} className="crm-bars__label">{s.label}</Link>
                <span className="crm-bars__track" title={`${s.label} : ${s.count} entreprise(s)`}>
                  <span className="crm-bars__fill" style={{ width: `${(s.count / maxProspects) * 100}%` }} />
                </span>
                <span className="crm-bars__value">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>
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
          <h2>Dernières activités</h2>
          <Timeline activities={recent.docs} back="/crm" showClient />
        </section>
      </div>
    </>
  );
}
