import Link from "next/link";
import type { Admin, Client, CrmActivity, CrmContact, CrmDeal, CrmDocument } from "@/payload-types";
import { relationID } from "@/lib/access";
import {
  activityKindLabel,
  activityKinds,
  clientSources,
  clientStageLabel,
  clientStages,
  dealStageLabel,
  dealStages,
  defaultVatRate,
  documentKindLabel,
  documentStatusLabel,
  lineTotal,
  money,
} from "@/lib/crm";
import { dateInputValue, dateTimeInputValue, formatDate, formatDateTime } from "@/lib/crm-server";
import { deleteActivity, saveActivity, saveClient, saveContact, saveDeal, saveDocument, toggleActivity } from "@/app/(crm)/crm/actions";
import { Submit } from "./client";
// Server-rendered building blocks shared by the /crm pages.
type Search = Record<string, string | string[] | undefined>;
// Pages pass narrowed selections (select: { name: true }).
type Named = { id: number; name: string };
type ContactOption = Named & { client?: unknown };
export const param = (search: Search, key: string) => {
  const v = search[key];
  return typeof v === "string" ? v : "";
};
export function Flash({ search }: { search: Search }) {
  const ok = param(search, "ok").slice(0, 200);
  const error = param(search, "erreur").slice(0, 300);
  if (error) return <p className="crm-flash crm-flash--error" role="alert">{error}</p>;
  if (ok) return <p className="crm-flash" role="status">{ok}</p>;
  return null;
}
export function Head({ title, eyebrow, children }: { title: string; eyebrow?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="crm-head">
      <div>
        {eyebrow && <p className="crm-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children && <div className="crm-head__actions">{children}</div>}
    </header>
  );
}
const stageTone: Record<string, string> = { prospect: "wait", client: "ok", inactive: "off", won: "ok", lost: "off" };
export const ClientStage = ({ stage }: { stage?: string | null }) => (
  <span className={`crm-badge crm-badge--${stageTone[stage ?? ""] ?? "info"}`}>{clientStageLabel(stage)}</span>
);
export const DealStage = ({ stage }: { stage?: string | null }) => (
  <span className={`crm-badge crm-badge--${stageTone[stage ?? ""] ?? "info"}`}>{dealStageLabel(stage)}</span>
);
export function Pager({ page, totalPages, base, search }: { page: number; totalPages: number; base: string; search: Search }) {
  if (totalPages <= 1) return null;
  const href = (n: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(search)) if (typeof v === "string" && v && !["page", "ok", "erreur"].includes(k)) params.set(k, v);
    params.set("page", String(n));
    return `${base}?${params}`;
  };
  return (
    <nav className="crm-pager" aria-label="Pagination">
      {page > 1 ? <Link href={href(page - 1)}>← Précédent</Link> : <span />}
      <span>Page {page} sur {totalPages}</span>
      {page < totalPages ? <Link href={href(page + 1)}>Suivant →</Link> : <span />}
    </nav>
  );
}
export const Empty = ({ children }: { children: React.ReactNode }) => <p className="crm-empty">{children}</p>;
const name = (doc: unknown) =>
  doc && typeof doc === "object" ? String(("name" in doc && doc.name) || ("title" in doc && doc.title) || ("email" in doc && doc.email) || "") : "";
export const relationName = name;
export function ClientLink({ client }: { client: unknown }) {
  const id = relationID(client);
  return id === null ? <>—</> : <Link href={`/crm/clients/${id}`}>{name(client) || `Entreprise n°${id}`}</Link>;
}
function Select({ label, name: field, value, options, empty, required }: {
  label: string; name: string; value?: unknown; options: readonly { value: string | number; label: string }[]; empty?: string; required?: boolean;
}) {
  return (
    <label>
      {label}
      <select name={field} defaultValue={value == null ? "" : String(value)} required={required}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
const list = (l: readonly (readonly [string, string, ...unknown[]])[]) => l.map(([value, label]) => ({ value, label }));
const people = (admins: Admin[]) => admins.map((a) => ({ value: a.id, label: a.name || a.email }));
export function ClientForm({ client, admins, back }: { client?: Client; admins: Admin[]; back?: string }) {
  return (
    <form action={saveClient} className="crm-form">
      {client && <input type="hidden" name="id" value={client.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="crm-grid">
        <label className="crm-span-2">
          Nom de l’entreprise *
          <input name="name" required maxLength={160} defaultValue={client?.name} />
        </label>
        <Select label="Statut commercial" name="stage" value={client?.stage ?? "prospect"} options={list(clientStages)} />
        <Select label="Origine" name="source" value={client?.source} options={list(clientSources)} empty="Non renseignée" />
        <Select label="Responsable" name="owner" value={relationID(client?.owner)} options={people(admins)} empty="Personne" />
        <label>Secteur d’activité<input name="sector" maxLength={80} defaultValue={client?.sector ?? ""} /></label>
        <label>NINEA / RCCM<input name="registration" maxLength={80} defaultValue={client?.registration ?? ""} /></label>
        <label>Email<input name="email" type="email" maxLength={150} defaultValue={client?.email ?? ""} /></label>
        <label>Téléphone<input name="phone" type="tel" maxLength={40} defaultValue={client?.phone ?? ""} /></label>
        <label>Site web<input name="website" maxLength={200} placeholder="https://…" defaultValue={client?.website ?? ""} /></label>
        <label className="crm-span-2">Adresse<input name="address" maxLength={200} defaultValue={client?.address ?? ""} /></label>
        <label>Ville<input name="city" maxLength={80} defaultValue={client?.city ?? ""} /></label>
        <label>Pays<input name="country" maxLength={60} defaultValue={client?.country ?? (client ? "" : "Sénégal")} /></label>
        <label className="crm-span-all">Notes<textarea name="notes" rows={4} maxLength={5000} defaultValue={client?.notes ?? ""} /></label>
      </div>
      <Submit>{client ? "Enregistrer les modifications" : "Créer l’entreprise"}</Submit>
    </form>
  );
}
export function ContactForm({ contact, clientID, clients, back }: { contact?: CrmContact; clientID?: number; clients?: Named[]; back?: string }) {
  const client = clientID ?? relationID(contact?.client);
  return (
    <form action={saveContact} className="crm-form">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="crm-grid">
        {clients ? (
          <Select label="Entreprise *" name="client" value={client} required empty="Choisir…" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        ) : (
          <input type="hidden" name="client" value={client ?? ""} />
        )}
        <label>Nom et prénom *<input name="name" required maxLength={120} defaultValue={contact?.name} /></label>
        <label>Fonction<input name="jobTitle" maxLength={120} defaultValue={contact?.jobTitle ?? ""} /></label>
        <label>Email<input name="email" type="email" maxLength={150} defaultValue={contact?.email ?? ""} /></label>
        <label>Téléphone<input name="phone" type="tel" maxLength={40} defaultValue={contact?.phone ?? ""} /></label>
        <label className="crm-check"><input type="checkbox" name="primary" defaultChecked={!!contact?.primary} /> Interlocuteur principal</label>
        <label className="crm-span-all">Notes<textarea name="notes" rows={3} maxLength={5000} defaultValue={contact?.notes ?? ""} /></label>
      </div>
      <Submit>{contact ? "Enregistrer le contact" : "Ajouter le contact"}</Submit>
    </form>
  );
}
export function DealForm({ deal, clientID, clients, contacts, admins, back }: {
  deal?: CrmDeal; clientID?: number; clients?: Named[]; contacts: ContactOption[]; admins: Admin[]; back?: string;
}) {
  const client = clientID ?? relationID(deal?.client);
  return (
    <form action={saveDeal} className="crm-form">
      {deal && <input type="hidden" name="id" value={deal.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="crm-grid">
        <label className="crm-span-2">Intitulé *<input name="title" required maxLength={160} defaultValue={deal?.title} placeholder="Ex. Migration messagerie et sauvegardes" /></label>
        {clients ? (
          <Select label="Entreprise *" name="client" value={client} required empty="Choisir…" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        ) : (
          <input type="hidden" name="client" value={client ?? ""} />
        )}
        {contacts.length > 0 && (
          <Select label="Contact" name="contact" value={relationID(deal?.contact)} empty="Aucun"
            options={contacts.map((c) => ({ value: c.id, label: name(c.client) ? `${c.name} (${name(c.client)})` : c.name }))} />
        )}
        <Select label="Étape" name="stage" value={deal?.stage ?? "lead"} options={list(dealStages)} />
        <label>Montant estimé (FCFA HT)<input name="amount" inputMode="numeric" maxLength={20} defaultValue={deal?.amount ?? ""} placeholder="0" /></label>
        <label>Probabilité (%)<input name="probability" type="number" min={0} max={100} defaultValue={deal?.probability ?? ""} placeholder="selon l’étape" /></label>
        <label>Clôture prévue<input name="expectedClose" type="date" defaultValue={dateInputValue(deal?.expectedClose)} /></label>
        <Select label="Responsable" name="owner" value={relationID(deal?.owner)} options={people(admins)} empty="Personne" />
        {deal && <label>Raison de la perte (si perdue)<input name="lostReason" maxLength={200} defaultValue={deal.lostReason ?? ""} /></label>}
        <label className="crm-span-all">Notes<textarea name="notes" rows={3} maxLength={5000} defaultValue={deal?.notes ?? ""} /></label>
      </div>
      <Submit>{deal ? "Enregistrer l’opportunité" : "Créer l’opportunité"}</Submit>
    </form>
  );
}
export function ActivityForm({ activity, clientID, dealID, clients, contacts, admins, back }: {
  activity?: CrmActivity; clientID?: number; dealID?: number; clients?: Named[]; contacts: ContactOption[]; admins: Admin[]; back: string;
}) {
  const deal = dealID ?? relationID(activity?.deal);
  return (
    <form action={saveActivity} className="crm-form">
      <input type="hidden" name="back" value={back} />
      {activity && <input type="hidden" name="id" value={activity.id} />}
      {deal && <input type="hidden" name="deal" value={deal} />}
      <div className="crm-grid">
        {clients ? (
          <Select label="Entreprise *" name="client" required empty="Choisir…" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        ) : (
          <input type="hidden" name="client" value={clientID ?? relationID(activity?.client) ?? ""} />
        )}
        <Select label="Type" name="kind" value={activity?.kind ?? "call"} options={list(activityKinds)} />
        <label className="crm-span-2">Objet *<input name="subject" required maxLength={200} defaultValue={activity?.subject} placeholder="Ex. Relance devis, compte rendu de réunion…" /></label>
        {contacts.length > 0 && (
          <Select label="Contact" name="contact" value={relationID(activity?.contact)} empty="Aucun" options={contacts.map((c) => ({ value: c.id, label: c.name }))} />
        )}
        <label>Échéance (tâche à venir)<input name="dueAt" type="datetime-local" defaultValue={dateTimeInputValue(activity?.dueAt)} /></label>
        <Select label="Assignée à" name="assignee" value={relationID(activity?.assignee)} options={people(admins)} empty="Personne" />
        <label className="crm-check"><input type="checkbox" name="remind" defaultChecked={activity ? activity.remind !== false : true} /> Rappel par email à l’échéance</label>
        {activity && <label className="crm-check"><input type="checkbox" name="done" defaultChecked={!!activity.done} /> Terminée</label>}
        <label className="crm-span-all">Détails<textarea name="details" rows={activity ? 6 : 3} maxLength={10000} defaultValue={activity?.details ?? ""} /></label>
      </div>
      {!activity && <p className="crm-hint">Sans échéance, un appel, email, rendez-vous ou note est enregistré comme déjà fait ; une tâche reste à faire.</p>}
      <Submit>{activity ? "Enregistrer les modifications" : "Ajouter"}</Submit>
    </form>
  );
}
const reminderLabels: Record<string, [string, string]> = {
  accepted: ["Rappel email accepté par le serveur", "ok"],
  failed: ["Rappel email refusé", "off"],
  uncertain: ["Rappel email incertain", "wait"],
  dispatching: ["Rappel email en cours d’envoi", "info"],
};
export function Timeline({ activities, back, showClient, reminders }: {
  activities: CrmActivity[]; back: string; showClient?: boolean; reminders?: Map<number, string>;
}) {
  if (!activities.length) return <Empty>Aucune activité pour l’instant.</Empty>;
  const now = Date.now();
  return (
    <ol className="crm-timeline">
      {activities.map((a) => {
        const late = !a.done && a.dueAt && new Date(a.dueAt).getTime() < now;
        return (
          <li key={a.id} className={`crm-timeline__item${a.done ? " is-done" : ""}${late ? " is-late" : ""}`}>
            <div className="crm-timeline__meta">
              <span className={`crm-kind crm-kind--${a.kind}`}>{activityKindLabel(a.kind)}</span>
              {a.dueAt && !a.done ? (
                <span className={late ? "crm-late" : ""}>{late ? "En retard · " : "Prévu "}{formatDateTime(a.dueAt)}</span>
              ) : (
                <span>{formatDateTime(a.doneAt ?? a.createdAt)}</span>
              )}
              {showClient && <ClientLink client={a.client} />}
              {a.deal && typeof a.deal === "object" && <Link href={`/crm/opportunites/${a.deal.id}`}>{a.deal.title}</Link>}
              {a.contact && typeof a.contact === "object" && <span>avec {a.contact.name}</span>}
              {a.assignee && typeof a.assignee === "object" && <span>→ {a.assignee.name || a.assignee.email}</span>}
              {reminders?.has(a.id) && (
                <span className={`crm-badge crm-badge--${reminderLabels[reminders.get(a.id)!]?.[1] ?? "info"}`}>
                  {reminderLabels[reminders.get(a.id)!]?.[0] ?? "Rappel email"}
                </span>
              )}
            </div>
            <strong>{a.subject}</strong>
            {a.details && <p className="crm-pre">{a.details}</p>}
            <div className="crm-row-actions">
              <Link className="crm-btn crm-btn--small crm-btn--ghost" href={`/crm/activites/${a.id}?retour=${encodeURIComponent(back)}`}>Modifier</Link>
              {(a.dueAt || a.kind === "task" || !a.done) && (
                <form action={toggleActivity}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="done" value={a.done ? "false" : "true"} />
                  <input type="hidden" name="back" value={back} />
                  <Submit className="crm-btn crm-btn--small">{a.done ? "Rouvrir" : "Marquer comme faite"}</Submit>
                </form>
              )}
              <form action={deleteActivity}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="back" value={back} />
                <Submit className="crm-btn crm-btn--small crm-btn--ghost" confirm="Supprimer cette activité ?">Supprimer</Submit>
              </form>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
export function DealRows({ deals, showClient }: { deals: CrmDeal[]; showClient?: boolean }) {
  if (!deals.length) return <Empty>Aucune opportunité.</Empty>;
  return (
    <div className="crm-table-wrap">
      <table className="crm-table">
        <thead>
          <tr><th>Opportunité</th>{showClient && <th>Entreprise</th>}<th>Étape</th><th className="num">Montant</th><th>Clôture</th></tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id}>
              <td><Link href={`/crm/opportunites/${d.id}`}>{d.title}</Link></td>
              {showClient && <td><ClientLink client={d.client} /></td>}
              <td><DealStage stage={d.stage} /></td>
              <td className="num">{money(d.amount)}</td>
              <td>{formatDate(d.closedAt ?? d.expectedClose)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocumentRows({ documents, showClient }: { documents: CrmDocument[]; showClient?: boolean }) {
  if (!documents.length) return <Empty>Aucun devis, facture ni avoir.</Empty>;
  const now = Date.now();
  return (
    <div className="crm-table-wrap">
      <table className="crm-table">
        <thead>
          <tr><th>Numéro</th><th>Objet</th>{showClient && <th>Entreprise</th>}<th>Statut</th><th className="num">Total TTC</th><th className="num">Reste dû</th><th>Date</th></tr>
        </thead>
        <tbody>
          {documents.map((d) => {
            const late = d.kind === "invoice" && d.status === "issued" && d.dueDate && new Date(d.dueDate).getTime() < now;
            return (
              <tr key={d.id}>
                <td>
                  <Link href={`/crm/documents/${d.id}`}><strong>{d.number ?? "Brouillon"}</strong></Link>
                  <small className="crm-sub">{documentKindLabel(d.kind, d.invoiceType)}</small>
                </td>
                <td>{d.title}</td>
                {showClient && <td><ClientLink client={d.client} /></td>}
                <td><DocumentStatus doc={d} />{late && <small className="crm-sub crm-late">Échéance dépassée</small>}</td>
                <td className="num">{d.kind === "credit" ? `− ${money(d.total)}` : money(d.total)}</td>
                <td className="num">{d.kind === "invoice" && d.status !== "cancelled" && d.number ? money(d.balance) : "—"}</td>
                <td>{formatDate(d.issueDate ?? d.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const documentTone: Record<string, string> = { accepted: "ok", paid: "ok", refused: "off", cancelled: "off", sent: "wait", issued: "wait" };
export const DocumentStatus = ({ doc }: { doc: Pick<CrmDocument, "kind" | "status"> & { amountPaid?: number | null } }) => {
  const partial = doc.kind === "invoice" && doc.status === "issued" && (doc.amountPaid ?? 0) > 0;
  return (
    <span className={`crm-badge crm-badge--${partial ? "info" : doc.kind === "credit" && doc.status === "issued" ? "ok" : documentTone[doc.status] ?? "info"}`}>
      {partial ? "Partiellement payée" : documentStatusLabel(doc.kind, doc.status)}
    </span>
  );
};
// Fixed rows (existing lines + empty ones): works without JavaScript; save to get more.
export function DocumentForm({ doc, kind, clientID, dealID, clients, contacts, deals, back }: {
  doc?: CrmDocument; kind: "quote" | "invoice" | "credit"; clientID?: number; dealID?: number; clients?: Named[];
  contacts: ContactOption[]; deals: { id: number; title: string }[]; back?: string;
}) {
  const lines = doc?.lines ?? [];
  const rows = [...lines, ...Array.from({ length: Math.max(3, 8 - lines.length) }, () => null)].slice(0, 60);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const rate = doc?.vatRate ?? defaultVatRate;
  return (
    <form action={saveDocument} className="crm-form">
      {doc ? <input type="hidden" name="id" value={doc.id} /> : <input type="hidden" name="kind" value={kind} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="crm-grid">
        <label className="crm-span-2">Objet *<input name="title" required maxLength={200} defaultValue={doc?.title} placeholder="Ex. Installation du réseau du siège" /></label>
        {kind === "credit" ? null : clients ? (
          <Select label="Entreprise *" name="client" value={clientID} required empty="Choisir…" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        ) : (
          <input type="hidden" name="client" value={clientID ?? relationID(doc?.client) ?? ""} />
        )}
        {contacts.length > 0 && (
          <Select label="À l’attention de" name="contact" value={relationID(doc?.contact)} empty="Personne en particulier"
            options={contacts.map((c) => ({ value: c.id, label: name(c.client) ? `${c.name} (${name(c.client)})` : c.name }))} />
        )}
        {deals.length > 0 && kind !== "credit" && (
          <Select label="Opportunité" name="deal" value={dealID ?? relationID(doc?.deal)} empty="Aucune" options={deals.map((d) => ({ value: d.id, label: d.title }))} />
        )}
        {kind === "quote" && <label>Valable jusqu’au<input name="validUntil" type="date" defaultValue={doc ? dateInputValue(doc.validUntil) : in30} /></label>}
        {kind === "invoice" && <label>Échéance de paiement<input name="dueDate" type="date" defaultValue={doc ? dateInputValue(doc.dueDate) : in30} /></label>}
        <label>TVA par défaut des lignes (%)<input name="vatRate" type="number" min={0} max={100} step="0.01" defaultValue={rate} /></label>
      </div>
      <div className="crm-table-wrap crm-lines">
        <table className="crm-table">
          <thead><tr><th>Désignation</th><th className="num">Quantité</th><th>Unité</th><th className="num">Prix unitaire HT (FCFA)</th><th className="num">TVA %</th><th className="num">Total HT</th></tr></thead>
          <tbody>
            {rows.map((l, n) => (
              <tr key={n}>
                <td><textarea name={`line-${n}-description`} rows={2} maxLength={1000} defaultValue={l?.description ?? ""} aria-label={`Désignation ligne ${n + 1}`} /></td>
                <td className="num"><input name={`line-${n}-quantity`} inputMode="decimal" defaultValue={l?.quantity ?? ""} placeholder="1" aria-label={`Quantité ligne ${n + 1}`} /></td>
                <td><input name={`line-${n}-unit`} maxLength={20} defaultValue={l?.unit ?? ""} placeholder="jour, unité…" aria-label={`Unité ligne ${n + 1}`} /></td>
                <td className="num"><input name={`line-${n}-unitPrice`} inputMode="numeric" defaultValue={l?.unitPrice ?? ""} aria-label={`Prix unitaire ligne ${n + 1}`} /></td>
                <td className="num"><input name={`line-${n}-vatRate`} inputMode="decimal" defaultValue={l?.vatRate ?? ""} placeholder={String(rate)} aria-label={`TVA ligne ${n + 1}`} /></td>
                <td className="num">{l ? money(lineTotal(l)) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="crm-hint">
        Les lignes vides sont ignorées ; enregistrez pour obtenir de nouvelles lignes vides. TVA vide = taux par défaut (0 pour une ligne exonérée).
        {kind === "invoice" && " Un prix négatif sert à déduire un acompte ou une remise."}
        {kind === "credit" && " Pour un avoir partiel, réduisez les quantités ou les prix : le total ne peut pas dépasser la facture."}
        {" "}Les totaux sont calculés à l’enregistrement.
      </p>
      <div className="crm-grid">
        <label className="crm-span-all">Conditions imprimées (paiement, délais, validité)<textarea name="conditions" rows={3} maxLength={3000} defaultValue={doc?.conditions ?? ""} /></label>
        <label className="crm-span-all">Notes internes (non imprimées)<textarea name="notes" rows={2} maxLength={5000} defaultValue={doc?.notes ?? ""} /></label>
      </div>
      <Submit>{doc ? "Enregistrer" : kind === "quote" ? "Créer le devis" : "Créer la facture"}</Submit>
    </form>
  );
}
