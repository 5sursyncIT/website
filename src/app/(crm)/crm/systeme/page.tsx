import Link from "next/link";
import { notFound } from "next/navigation";
import { as, crmContext, formatDateTime } from "@/lib/crm-server";
import { relationID } from "@/lib/access";
import { ageInDays, backupState } from "@/lib/backup-state";
import { mailContext, mailUnavailable } from "@/lib/mail/crm";
import { waitingState } from "@/lib/support";
import { Head } from "@/components/crm/parts";
export const dynamic = "force-dynamic";
export const metadata = { title: "État du système" };
// One place answering "is anything stuck?": mail synchronisation, rejected addresses,
// requests nobody has treated, tickets owing an answer, and the backup / last tested
// restore. Each line says when it was last measured; nothing is inferred.
export default async function SystemState() {
  // Supervision mixes Support and mail data: full administrators only.
  const { ctx, deps, reason } = await mailContext();
  if (!ctx.full) notFound();
  const { payload } = ctx;
  const [converted, tickets, backup] = await Promise.all([
    payload.find({ collection: "crm-activities", where: { request: { exists: true } }, pagination: false, depth: 0, select: { request: true }, ...as(ctx) }),
    payload.find({
      collection: "tickets",
      where: { status: { in: ["open", "in-progress"] } },
      pagination: false,
      depth: 0,
      select: { subject: true, status: true, createdAt: true, priority: true },
      ...as(ctx),
    }),
    backupState(),
  ]);
  const treated = [...new Set(converted.docs.map((a) => relationID(a.request)).filter((v) => v !== null))];
  const [requests, oldest] = await Promise.all([
    payload.count({ collection: "contact-requests", where: treated.length ? { id: { not_in: treated } } : {}, ...as(ctx) }),
    payload.find({
      collection: "contact-requests",
      where: treated.length ? { id: { not_in: treated } } : {},
      sort: "createdAt",
      limit: 1,
      depth: 0,
      select: { name: true, company: true, createdAt: true },
      ...as(ctx),
    }),
  ]);
  const replies = tickets.docs.length
    ? await payload.find({
        collection: "ticket-replies",
        where: { ticket: { in: tickets.docs.map((t) => t.id) } },
        pagination: false,
        depth: 0,
        select: { ticket: true, author: true, createdAt: true },
        ...as(ctx),
      })
    : null;
  const awaiting = tickets.docs
    .map((t) => ({ ticket: t, wait: waitingState(t, replies?.docs ?? []) }))
    .filter((q) => q.wait.awaiting)
    .sort((a, b) => String(a.wait.since ?? "").localeCompare(String(b.wait.since ?? "")));
  // Mail dependencies are null in preproduction or without configuration (deps === null):
  // the line then says so instead of showing an empty, reassuring table.
  const store = deps?.store ?? null;
  const imap = !!deps && "imap" in deps;
  const syncs = store ? await store.syncStates(imap ? "imap" : "graph") : [];
  const blocked = store ? await store.suppressions() : [];
  const syncError = syncs.find((s) => s.last_error);
  const backupAge = ageInDays(backup.lastBackup?.created_at);
  const restoreAge = ageInDays(backup.lastRestoreTest?.created_at);
  const requestAge = ageInDays(oldest.docs[0]?.createdAt ? new Date(oldest.docs[0].createdAt) : null);
  const lines = [
    {
      label: "Messagerie contact@",
      value: !store ? "Désactivée" : syncError ? "Erreur au dernier passage" : syncs.length ? "Synchronisée" : "Aucun passage enregistré",
      detail: !store
        ? mailUnavailable[reason ?? "disabled"] ?? "Aucun transport configuré sur cet environnement."
        : syncError
          ? `${syncError.folder} : ${syncError.last_error} (${formatDateTime(syncError.last_error_at)})`
          : syncs.map((s) => `${s.folder} : dernier succès ${formatDateTime(s.last_success_at)}`).join(" · ") || "—",
      warn: !!store && !!syncError,
      href: "/crm/messagerie?vue=etat",
    },
    {
      label: "Adresses bloquées (non-remise)",
      value: String(blocked.length),
      detail: blocked.length
        ? blocked.slice(0, 3).map((b) => b.address).join(", ") + (blocked.length > 3 ? "…" : "")
        : "Aucune adresse déclarée inexistante.",
      warn: blocked.length > 0,
      href: "/crm/messagerie?vue=etat",
    },
    {
      label: "Demandes du site non traitées",
      value: String(requests.totalDocs),
      detail: oldest.docs[0]
        ? `La plus ancienne : ${oldest.docs[0].company || oldest.docs[0].name}, reçue le ${formatDateTime(oldest.docs[0].createdAt)}${requestAge !== null ? ` (${requestAge} jour${requestAge > 1 ? "s" : ""})` : ""}.`
        : "Toutes les demandes reçues ont été converties ou rattachées.",
      warn: requestAge !== null && requestAge > 7,
      href: "/crm/demandes",
    },
    {
      label: "Tickets sans réponse de l’équipe",
      value: String(awaiting.length),
      detail: awaiting.length
        ? `Le plus ancien : « ${awaiting[0].ticket.subject} », en attente depuis le ${formatDateTime(awaiting[0].wait.since)}.`
        : `Aucun ticket n’attend l’équipe (${tickets.docs.length} ouvert${tickets.docs.length > 1 ? "s" : ""} ou en cours).`,
      warn: awaiting.length > 0,
      href: "/crm",
    },
    {
      label: "Dernière sauvegarde",
      value: !backup.available ? "Non mesurée" : backup.lastBackup ? `${backupAge} jour${(backupAge ?? 0) > 1 ? "s" : ""}` : "Jamais enregistrée",
      detail: !backup.available
        ? "Le journal des sauvegardes n’est pas disponible sur cet environnement (migration non appliquée ou base inaccessible)."
        : backup.lastBackup
          ? `${backup.lastBackup.reference} · ${formatDateTime(backup.lastBackup.created_at)}${backup.lastBackup.size_bytes ? ` · ${Math.round(Number(backup.lastBackup.size_bytes) / 1048576)} Mo` : ""}`
          : "Aucune exécution de deployment/backup.sh enregistrée depuis la mise en place du journal.",
      warn: backup.available && (backup.lastBackup === null || (backupAge ?? 0) > 7),
    },
    {
      label: "Dernière restauration réellement testée",
      value: !backup.available ? "Non mesurée" : backup.lastRestoreTest ? `${restoreAge} jour${(restoreAge ?? 0) > 1 ? "s" : ""}` : "Jamais testée",
      detail: backup.lastRestoreTest
        ? `${backup.lastRestoreTest.reference} · ${formatDateTime(backup.lastRestoreTest.created_at)} · ${backup.lastRestoreTest.detail}`
        : "Aucun test enregistré. Lancer « sh deployment/restore-test.sh » : la sauvegarde est restaurée dans une base de contrôle jetable, vérifiée, puis supprimée. L’existence d’un fichier de sauvegarde ne prouve pas qu’il se restaure.",
      warn: backup.available && (backup.lastRestoreTest === null || (restoreAge ?? 0) > 30),
    },
  ];
  return (
    <>
      <Head title="État du système" eyebrow="Supervision : messagerie, demandes, Support, sauvegarde">
        <Link className="crm-btn crm-btn--ghost" href="/crm/messagerie?vue=etat">Détail messagerie</Link>
      </Head>
      <p className="crm-hint">
        Chaque ligne indique la dernière mesure enregistrée et la date correspondante.
        Rien n’est déduit : une sauvegarde ou une restauration n’apparaît que si le script
        correspondant l’a enregistrée.
      </p>
      <section className="crm-card">
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead><tr><th>Point de contrôle</th><th>État</th><th>Dernière mesure</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label}>
                  <th scope="row">{l.href ? <Link href={l.href}>{l.label}</Link> : l.label}</th>
                  <td><strong className={l.warn ? "crm-late" : ""}>{l.value}</strong></td>
                  <td>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {backup.recent.length > 0 && (
        <section className="crm-card">
          <h2>Journal des sauvegardes et restaurations</h2>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Date</th><th>Opération</th><th>Résultat</th><th>Référence</th><th>Détail</th></tr></thead>
              <tbody>
                {backup.recent.map((e, i) => (
                  <tr key={i}>
                    <td>{formatDateTime(e.created_at)}</td>
                    <td>{e.kind === "backup" ? "Sauvegarde" : "Restauration de contrôle"}</td>
                    <td><strong className={e.outcome === "failed" ? "crm-late" : ""}>{e.outcome === "ok" ? "Réussie" : "Échec"}</strong></td>
                    <td>{e.reference || "—"}</td>
                    <td>{e.detail || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
