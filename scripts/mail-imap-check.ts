// Connection check of the Simafri mailbox, WITHOUT sending anything and WITHOUT changing
// the mailbox: IMAP login, folders by SPECIAL-USE, read-only EXAMINE of Inbox / Drafts /
// Sent (counts only), then SMTP connection, STARTTLS with certificate check and AUTH,
// closed with QUIT before any MAIL FROM. Prints no password, no subject, no address but
// the mailbox's. Runs with the same environment as the application (mailStatus()).
// Usage (production container): npx tsx scripts/mail-imap-check.ts
import { mailStatus } from "../src/lib/mail/config";
import { ImapMailbox, MailServerError, smtpPhaseCode } from "../src/lib/mail/imap";

const status = mailStatus();
if (!status.enabled || status.provider !== "imap") {
  console.log(`Messagerie Simafri non active : ${status.enabled ? `fournisseur ${status.provider}` : status.reason}`);
  process.exit(2);
}
const c = status.config;
console.log(`Boîte ${c.mailboxAddress} · IMAP ${c.imap.host}:${c.imap.port} (TLS) · SMTP ${c.smtp.host}:${c.smtp.port} (STARTTLS)`);
const mailbox = new ImapMailbox(c);
let failed = false;
try {
  await mailbox.session(async (client, folders) => {
    console.log(`IMAP : connexion et authentification OK · UIDPLUS ${folders.uidplus ? "oui" : "NON"}`);
    console.log(`IMAP : Brouillons = « ${folders.drafts} », Envoyés = « ${folders.sent} » (attributs SPECIAL-USE${c.draftsPath || c.sentPath ? " ou chemins configurés" : ""})`);
    for (const [label, path] of [["Réception", folders.inbox], ["Brouillons", folders.drafts], ["Envoyés", folders.sent]] as const) {
      const box = await client.mailboxOpen(path, { readOnly: true });
      console.log(`IMAP : ${label} ouvert en lecture seule · ${box.exists} message(s) · UIDVALIDITY ${box.uidValidity}`);
    }
  });
} catch (e) {
  failed = true;
  console.log(`IMAP : ÉCHEC ${e instanceof MailServerError ? e.code : "inattendu"}`);
}
const smtp = await mailbox.smtpSession(async () => "ok", (phase, e) => smtpPhaseCode(phase, e));
console.log(smtp === "ok" ? "SMTP : connexion, STARTTLS (certificat vérifié) et authentification OK · aucun message envoyé (QUIT)" : `SMTP : ÉCHEC ${smtp}`);
process.exit(failed || smtp !== "ok" ? 1 : 0);
