import Link from "next/link";
import { formatDateTime } from "@/lib/crm-server";
import { canMail } from "@/lib/mail/access";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { DraftRows, MessageRows } from "@/components/crm/mail";
import { isImap, mailboxAddress } from "@/lib/mail/service";
import { Flash, Head } from "@/components/crm/parts";
import { liftBlock, syncNow } from "./actions";
import { Submit } from "@/components/crm/client";
export const metadata = { title: "Messagerie" };
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
  if (!deps) return <><Head title="Messagerie" /><p className="crm-empty">{mailUnavailable[reason ?? "disabled"]}</p></>;
  const imap = isImap(deps);
  const head = <Head title={`Messagerie ${mailboxAddress(deps)}`} eyebrow={imap ? "Boîte Simafri (SMTP / IMAP)" : "Boîte partagée Microsoft 365"} />;
  if (!canMail({ mailAccess: actor.level }, "read")) return <>{head}<p className="crm-empty">Votre compte n’a pas accès à la messagerie du CRM.</p></>;
  const { store } = deps;
  const sendState = (list: string[] | "*" | undefined) =>
    list === undefined ? "fermé" : list === "*" ? "ouvert" : `limité à la liste de recette (${list.length} adresse${list.length > 1 ? "s" : ""})`;
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
          <p className="crm-hint">{imap
            ? "« Accepté par le serveur SMTP » et « copie dans Envoyés » ne prouvent pas la réception par le destinataire. Un échec de livraison arrive plus tard, par un rapport de non-remise."
            : "« Accepté par Microsoft » et « présent dans les Éléments envoyés » ne prouvent pas la réception par le destinataire."}</p>
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
            <p className="crm-hint">Automatique toutes les 2 minutes en production. Une interruption reprend au dernier point enregistré.{imap && " Lecture seule : aucun message n’est marqué lu, déplacé ou supprimé par la synchronisation."}</p>
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead><tr><th>Dossier</th><th>Depuis</th><th>Dernier passage</th><th>Dernier succès</th><th>{imap ? "Position (UID)" : "Reprise initiale"}</th><th>Erreur</th></tr></thead>
                <tbody>
                  {(await store.syncStates(imap ? "imap" : "graph")).map((s) => (
                    <tr key={s.folder}>
                      <td>{s.folder.endsWith("inbox") ? "Boîte de réception" : imap ? "Envoyés" : "Éléments envoyés"}{imap && s.imap_path ? ` (${s.imap_path})` : ""}</td>
                      <td>{formatDateTime(s.initial_since)}</td>
                      <td>{formatDateTime(s.last_run_at)}</td>
                      <td>{formatDateTime(s.last_success_at)}</td>
                      <td>{imap ? `${s.last_uid}${s.uidvalidity ? ` · UIDVALIDITY ${s.uidvalidity}` : ""}` : s.complete ? "terminée" : "en cours"}</td>
                      <td>{s.last_error ? `${s.last_error} (${formatDateTime(s.last_error_at)})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="crm-card">
            <h2>Configuration</h2>
            {isImap(deps) ? (
              <ul className="crm-list">
                <li><span>Boîte : <strong>{deps.imap.config.mailboxAddress}</strong> · nom affiché « {deps.imap.config.displayName} »</span></li>
                <li><span>Envoi SMTP : {deps.imap.config.smtp.host}:{deps.imap.config.smtp.port}, STARTTLS obligatoire, certificat vérifié</span></li>
                <li><span>Lecture IMAP : {deps.imap.config.imap.host}:{deps.imap.config.imap.port}, TLS, certificat vérifié</span></li>
                <li><span>Mot de passe : fichier secret du serveur (jamais affiché)</span></li>
                <li><span>Reprise initiale : {deps.imap.config.sinceDays} jours</span></li>
                <li><span>Envoi : {sendState(deps.imap.config.sendAllowlist)}</span></li>
              </ul>
            ) : (
              <ul className="crm-list">
                <li><span>Boîte : <strong>{deps.graph.config.mailboxAddress}</strong></span></li>
                <li><span>Reprise initiale : {deps.graph.config.sinceDays} jours</span></li>
                <li><span>Envoi : {sendState(deps.graph.config.sendAllowlist)}</span></li>
                {[deps.graph.config.read, deps.graph.config.send].map((c) => (
                  <li key={c.name}><span>Certificat « {c.name === "read" ? "lecture et brouillons" : "envoi"} » : expire le {formatDateTime(c.notAfter)} ({daysLeft(c.notAfter)} jours)</span></li>
                ))}
              </ul>
            )}
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
            <p className="crm-hint">Seule une adresse déclarée inexistante (code 5.1.x) est bloquée ; un blocage de transport ou de politique (5.7.x) est signalé sur l’envoi sans bloquer l’adresse. Aucune relance automatique ; l’envoi vers une adresse bloquée est refusé tant qu’une personne ne lève pas le blocage.</p>
          </section>
        </>
      )}
    </>
  );
}
