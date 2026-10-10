import Link from "next/link";
import { notFound } from "next/navigation";
import { as, crmContext, formatDate, formatDateTime, pageNumber } from "@/lib/crm-server";
import { activityKindLabel, clientSourceLabel, isActiveProspect, isOpenStage, lostReasonLabel, money, prospectStages, weighted } from "@/lib/crm";
import { statusLabel } from "@/lib/support";
import { topicLabel } from "@/lib/contact-topics";
import { database } from "@/lib/database";
import { reminderStates } from "@/lib/crm-reminders";
import { deleteClient, deleteContact } from "../../actions";
import { Submit } from "@/components/crm/client";
import { WhatsAppButton } from "@/components/crm/whatsapp";
import { MailSection } from "@/components/crm/mail";
import { waCandidates, waMode } from "@/lib/whatsapp";
import { ActivityForm, ClientForm, ClientStage, ContactForm, DealForm, DealRows, DocumentRows, Flash, FollowUpForm, Head, Pager, ProspectStage, Timeline, param } from "@/components/crm/parts";
type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
export async function generateMetadata() {
  return { title: "Fiche entreprise" };
}
export default async function ClientPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id: raw }, search] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const ctx = await crmContext();
  const { payload } = ctx;
  const client = await payload.findByID({ collection: "clients", id, depth: 1, disableErrors: true, ...as(ctx) });
  if (!client) notFound();
  const where = { client: { equals: id } };
  const historyPage = pageNumber(param(search, "page"));
  const [contacts, deals, todoAll, historyPaged, tickets, accounts, admins, documents] = await Promise.all([
    payload.find({ collection: "crm-contacts", where, sort: "-primary,name", pagination: false, depth: 0, ...as(ctx) }),
    payload.find({ collection: "crm-deals", where, sort: "-updatedAt", pagination: false, depth: 0, ...as(ctx) }),
    // Open tasks: every one of them, soonest due date first. Never capped, so an old
    // action still open stays the next action instead of falling off a recent-50 window.
    payload.find({ collection: "crm-activities", where: { ...where, done: { equals: false } }, sort: "dueAt", pagination: false, depth: 1, ...as(ctx) }),
    // History: done activities, newest first, paginated.
    payload.find({ collection: "crm-activities", where: { ...where, done: { equals: true } }, sort: "-createdAt", page: historyPage, limit: 20, depth: 1, ...as(ctx) }),
    // Support data: counted with full rights (deletion guard), listed for full administrators only.
    payload.find({ collection: "tickets", where, sort: "-updatedAt", limit: 5, depth: 0, select: { subject: true, status: true, updatedAt: true }, overrideAccess: true }),
    payload.count({ collection: "client-accounts", where, overrideAccess: true }),
    payload.find({ collection: "admins", pagination: false, depth: 0, ...as(ctx) }),
    payload.find({ collection: "crm-documents", where, sort: "-createdAt", limit: 20, depth: 0, ...as(ctx) }),
  ]);
  const reminders = await reminderStates(database(), [...todoAll.docs, ...historyPaged.docs].map((a) => a.id));
  const back = `/crm/clients/${id}`;
  const open = deals.docs.filter((d) => isOpenStage(d.stage));
  const won = deals.docs.filter((d) => d.stage === "won");
  // Open tasks first (dated ones by due date, undated last); then the paginated history.
  const todo = todoAll.docs.slice().sort((a, b) => String(a.dueAt ?? "9").localeCompare(String(b.dueAt ?? "9")));
  const history = historyPaged.docs;
  // Next actions: open and dated, soonest first. Computed on every open task, not a window.
  const planned = todo.filter((a) => a.dueAt);
  const next = planned[0];
  const active = isActiveProspect(client.pipeline);
  const needs = (client.needs ?? []) as string[];
  const now = Date.now();
  const closeParam = Number(param(search, "action"));
  const close = planned.some((a) => a.id === closeParam) ? closeParam : null;
  const stageParam = param(search, "etape");
  const presetStage = prospectStages.some(([v]) => v === stageParam) ? stageParam : undefined;
  const wa = waCandidates({ client, contacts: contacts.docs, scope: "client" });
  const owner = client.owner && typeof client.owner === "object" ? client.owner.name || client.owner.email : null;
  return (
    <>
      <Head title={client.name} eyebrow={<Link href="/crm/clients">← Entreprises</Link>}>
        <ClientStage stage={client.stage} />
        {ctx.full && <a className="crm-btn crm-btn--ghost" href={`/admin/collections/clients/${id}`}>Accès Support ↗</a>}
      </Head>
      <Flash search={search} />
      <section className="crm-facts">
        <div><span>Responsable</span><strong>{owner ?? "—"}</strong></div>
        <div><span>Origine</span><strong>{client.source ? clientSourceLabel(client.source) : "—"}</strong></div>
        <div><span>Téléphone</span><strong>{client.phone ? <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}>{client.phone}</a> : "—"}</strong></div>
        <div><span>Email</span><strong>{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : "—"}</strong></div>
        <div><span>Ville</span><strong>{[client.city, client.country].filter(Boolean).join(", ") || "—"}</strong></div>
        <div><span>Pipeline ouvert</span><strong>{money(open.reduce((s, d) => s + (d.amount || 0), 0))}</strong><small>pondéré {money(weighted(open))}</small></div>
        <div><span>Chiffre gagné</span><strong>{money(won.reduce((s, d) => s + (d.amount || 0), 0))}</strong><small>{won.length} affaire{won.length > 1 ? "s" : ""}</small></div>
        <div><span>Client depuis</span><strong>{formatDate(client.createdAt)}</strong></div>
      </section>
      <WhatsAppButton candidates={wa} mode={waMode(wa)} />
      {client.sourceRequest && typeof client.sourceRequest === "object" && (
        <p className="crm-hint">Créée depuis la demande du site de {client.sourceRequest.name} du {formatDate(client.sourceRequest.createdAt)}.</p>
      )}
      <section className="crm-card crm-next" id="suivi">
        <div className="crm-next__head">
          <div>
            <span className="crm-sub">Étape commerciale{client.pipelineAt ? ` depuis le ${formatDate(client.pipelineAt)}` : ""}</span>
            <strong><ProspectStage stage={client.pipeline} />{client.pipeline === "lost" && client.lostReason ? ` · ${lostReasonLabel(client.lostReason)}` : ""}</strong>
          </div>
          <div>
            <span className="crm-sub">Prochaine action</span>
            {next ? (
              <strong className={new Date(next.dueAt!).getTime() < now ? "crm-late" : ""}>
                {activityKindLabel(next.kind)} · {next.subject} · {formatDateTime(next.dueAt)}
                {next.assignee && typeof next.assignee === "object" ? ` → ${next.assignee.name || next.assignee.email}` : ""}
              </strong>
            ) : active ? (
              <strong className="crm-late">Aucune action prévue : planifiez la suivante.</strong>
            ) : (
              <strong>—</strong>
            )}
          </div>
        </div>
        <div className="crm-next__needs">
          <span className="crm-sub">Besoins et services demandés</span>
          {needs.length ? (
            <ul className="crm-tags">
              {needs.map((n) => <li key={n}>{topicLabel(n)}</li>)}
            </ul>
          ) : (
            <strong className="crm-sub">Aucun besoin renseigné : à préciser lors du prochain échange.</strong>
          )}
          {client.needsDetail && <p className="crm-pre">{client.needsDetail}</p>}
        </div>
        <details className="crm-add" open={!next && active || !!close || !!presetStage}>
          <summary>Enregistrer le suivi : échange, étape, prochaine action</summary>
          <FollowUpForm client={client} planned={planned} contacts={contacts.docs} admins={admins.docs} me={ctx.user.id as number}
            back={back} close={close} stage={presetStage} />
        </details>
      </section>
      <div className="crm-cols crm-cols--wide">
        <div className="crm-stack">
          <section className="crm-card">
            <h2>Activités et tâches</h2>
            <details className="crm-add">
              <summary>+ Noter un échange ou planifier une tâche</summary>
              <ActivityForm clientID={id} contacts={contacts.docs} admins={admins.docs} back={back} />
            </details>
            {todo.length > 0 && <><h3>À faire <span className="crm-count">{todo.length}</span></h3><Timeline activities={todo} back={back} reminders={reminders} /></>}
            <h3>Historique <span className="crm-count">{historyPaged.totalDocs}</span></h3>
            <Timeline activities={history} back={back} reminders={reminders} />
            <Pager page={historyPaged.page ?? 1} totalPages={historyPaged.totalPages} base={`/crm/clients/${id}`} search={search} />
          </section>
          <MailSection clientId={id} to={client.email} />
          <section className="crm-card">
            <h2>Opportunités</h2>
            <DealRows deals={deals.docs} />
            <details className="crm-add">
              <summary>+ Nouvelle opportunité</summary>
              <DealForm clientID={id} contacts={contacts.docs} admins={admins.docs} back={back} />
            </details>
          </section>
          <section className="crm-card">
            <h2>Devis et factures</h2>
            <DocumentRows documents={documents.docs} />
            <div className="crm-row-actions">
              <Link className="crm-btn crm-btn--small" href={`/crm/documents/nouveau?type=devis&entreprise=${id}`}>+ Devis</Link>
              <Link className="crm-btn crm-btn--small crm-btn--ghost" href={`/crm/documents/nouveau?type=facture&entreprise=${id}`}>+ Facture</Link>
            </div>
          </section>
        </div>
        <div className="crm-stack">
          <section className="crm-card">
            <h2>Contacts</h2>
            {contacts.docs.length ? (
              <ul className="crm-people">
                {contacts.docs.map((c) => (
                  <li key={c.id}>
                    <div>
                      <Link href={`/crm/contacts/${c.id}`}><strong>{c.name}</strong></Link>
                      {c.primary && <span className="crm-badge crm-badge--info">Principal</span>}
                      {c.jobTitle && <small className="crm-sub">{c.jobTitle}</small>}
                      <small className="crm-sub">
                        {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>}
                        {c.phone && c.email && " · "}
                        {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                      </small>
                    </div>
                    <form action={deleteContact}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="back" value={back} />
                      <Submit className="crm-btn crm-btn--small crm-btn--ghost" confirm={`Supprimer le contact ${c.name} ?`}>Supprimer</Submit>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="crm-empty">Aucun contact.</p>
            )}
            <details className="crm-add">
              <summary>+ Ajouter un contact</summary>
              <ContactForm clientID={id} back={back} />
            </details>
          </section>
          {ctx.full && <section className="crm-card">
            <h2>Support client</h2>
            <p className="crm-hint">
              {accounts.totalDocs} utilisateur{accounts.totalDocs > 1 ? "s" : ""} de l’espace Support · {tickets.totalDocs} ticket{tickets.totalDocs > 1 ? "s" : ""}.
              Invitations et réponses se gèrent dans l’administration.
            </p>
            {tickets.docs.length > 0 && (
              <ul className="crm-list">
                {tickets.docs.map((t) => (
                  <li key={t.id}>
                    <a href={`/admin/collections/tickets/${t.id}`}>{t.subject}</a>
                    <small>{statusLabel(t.status)} · {formatDate(t.updatedAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>}
          <section className="crm-card">
            <details id="coordonnees">
              <summary className="crm-summary">Modifier les informations de l’entreprise</summary>
              <ClientForm client={client} admins={admins.docs} back={back} />
            </details>
            {client.notes && <p className="crm-pre crm-notes">{client.notes}</p>}
            {client.website && <p><a href={client.website} target="_blank" rel="noopener noreferrer">{client.website} ↗</a></p>}
            {(client.sector || client.registration || client.address) && (
              <p className="crm-hint">{[client.sector, client.registration, client.address].filter(Boolean).join(" · ")}</p>
            )}
          </section>
          {accounts.totalDocs === 0 && tickets.totalDocs === 0 && documents.docs.every((d) => !d.number) && (
            <form action={deleteClient} className="crm-danger">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={back} />
              <Submit className="crm-btn crm-btn--danger" confirm={`Supprimer définitivement ${client.name}, ses contacts, opportunités et activités ?`}>
                Supprimer l’entreprise
              </Submit>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
