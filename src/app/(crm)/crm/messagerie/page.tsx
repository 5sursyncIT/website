import Link from "next/link";
import { formatDateTime } from "@/lib/crm-server";
import { canMail } from "@/lib/mail/access";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { DraftRows, MessageRows } from "@/components/crm/mail";
import { Flash, Head } from "@/components/crm/parts";
import { liftBlock, syncNow } from "./actions";
import { Submit } from "@/components/crm/client";
export const metadata = { title: "Messagerie contact@" };
type Search = Promise<Record<string, string | string[] | undefined>>;
const tabs = [
  ["attribuer", "À attribuer"],
  ["brouillons", "Brouillons à valider"],
  ["envois", "Envois"],
  ["etat", "État et diagnostic"],
] as const;
const daysLeft = (d: Date) => Math.floor((d.getTime() - Date.now()) / 86_400_000);
export default async function MailboxPage({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const view = tabs.some(([v]) => v === search.vue) ? String(search.vue) : "attribuer";
  const { deps, actor, reason } = await mailContext();
  const head = <Head title="Messagerie contact@" eyebrow="Boîte partagée Microsoft 365" />;
  if (!deps) return <>{head}<p className="crm-empty">{mailUnavailable[reason ?? "disabled"]}</p></>;
  if (!canMail({ mailAccess: actor.level }, "read")) return <>{head}<p className="crm-empty">Votre compte n’a pas accès à la messagerie contact@.</p></>;
  const { store, graph } = deps;
  return (
    <>
      {head}
      <Flash search={search} />
      <nav className="crm-tabs" aria-label="Vues de la messagerie">
        {tabs.map(([v, label]) => <Link key={v} href={`/crm/messagerie?vue=${v}`} aria-current={view === v ? "page" : undefined}>{label}</Link>)}
      </nav>
      {view === "attribuer" && (
        <section className="crm-card">
          <p className="crm-hint">Messages dont l’adresse ne correspond à aucune fiche, ou à plusieurs. Le CRM ne devine pas : ouvrez le message pour le rattacher.</p>
          <MessageRows messages={await store.unassigned()} empty="Rien à attribuer." />
        </section>
      )}
      {view === "brouillons" && (
        <section className="crm-card">
          <p className="crm-hint">Brouillons préparés dans le CRM, en attente d’envoi. L’envoi est réservé aux comptes autorisés, après relecture.</p>
          <DraftRows drafts={await store.draftsFor({ states: ["draft"] }, 100)} />
        </section>
      )}
      {view === "envois" && (
        <section className="crm-card">
          <p className="crm-hint">« Accepté par Microsoft » et « présent dans les Éléments envoyés » ne prouvent pas la réception par le destinataire.</p>
          <DraftRows drafts={await store.draftsFor({ states: ["sending", "accepted", "in_sent", "failed", "uncertain"] }, 100)} />
        </section>
      )}
      {view === "etat" && (
        <>
          <section className="crm-card">
            <h2>Synchronisation</h2>
            {canMail({ mailAccess: actor.level }, "draft") && (
              <form action={syncNow} className="crm-row-actions">
                <input type="hidden" name="back" value="/crm/messagerie?vue=etat" />
                <Submit className="crm-btn crm-btn--small crm-btn--ghost">Synchroniser maintenant</Submit>
              </form>
            )}
            <p className="crm-hint">Automatique toutes les 2 minutes en production. Une interruption reprend au dernier point enregistré.</p>
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead><tr><th>Dossier</th><th>Depuis</th><th>Dernier passage</th><th>Dernier succès</th><th>Reprise initiale</th><th>Erreur</th></tr></thead>
                <tbody>
                  {(await store.syncStates()).map((s) => (
                    <tr key={s.folder}>
                      <td>{s.folder === "inbox" ? "Boîte de réception" : "Éléments envoyés"}</td>
                      <td>{formatDateTime(s.initial_since)}</td>
                      <td>{formatDateTime(s.last_run_at)}</td>
                      <td>{formatDateTime(s.last_success_at)}</td>
                      <td>{s.complete ? "terminée" : "en cours"}</td>
                      <td>{s.last_error ? `${s.last_error} (${formatDateTime(s.last_error_at)})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="crm-card">
            <h2>Configuration</h2>
            <ul className="crm-list">
              <li><span>Boîte : <strong>{graph.config.mailboxAddress}</strong></span></li>
              <li><span>Reprise initiale : {graph.config.sinceDays} jours</span></li>
              <li><span>Envoi : {graph.config.sendAllowlist === undefined ? "fermé" : graph.config.sendAllowlist === "*" ? "ouvert" : `limité à la liste de recette (${graph.config.sendAllowlist.length} adresse${graph.config.sendAllowlist.length > 1 ? "s" : ""})`}</span></li>
              {[graph.config.read, graph.config.send].map((c) => (
                <li key={c.name}><span>Certificat « {c.name === "read" ? "lecture et brouillons" : "envoi"} » : expire le {formatDateTime(c.notAfter)} ({daysLeft(c.notAfter)} jours)</span></li>
              ))}
            </ul>
          </section>
          <section className="crm-card">
            <h2>Adresses bloquées (non-remise)</h2>
            {(await store.suppressions()).map((s) => (
              <form key={s.address} action={liftBlock} className="crm-inline-form">
                <span>{s.address} · {formatDateTime(s.created_at)}{s.ndr_message_id && <> · <Link href={`/crm/messagerie/${s.ndr_message_id}`}>rapport</Link></>}</span>
                <input type="hidden" name="address" value={s.address} />
                <input type="hidden" name="back" value="/crm/messagerie?vue=etat" />
                {canMail({ mailAccess: actor.level }, "send") && <Submit className="crm-btn crm-btn--small crm-btn--ghost" confirm={`Lever le blocage de ${s.address} ? Vérifiez d’abord l’adresse.`}>Lever le blocage</Submit>}
              </form>
            ))}
            <p className="crm-hint">Une adresse rejetée n’est jamais relancée automatiquement ; l’envoi vers elle est refusé tant que le blocage n’est pas levé par une personne.</p>
          </section>
        </>
      )}
    </>
  );
}
