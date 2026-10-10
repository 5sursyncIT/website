import { randomUUID } from "node:crypto";
import { database } from "../database";
import { contactSMTPTransport } from "../contact-smtp";
import { mailStatus, type Credential } from "./config";
import { imapSyncAll } from "./imap-sync";
import { isImap, mailDeps } from "./service";
import type { MailStore } from "./store";
import { syncAll } from "./sync";
// Production only (mailStatus: MAIL_ENABLED, production origin, credentials present).
// Every 2 minutes: Inbox and Sent (Graph deltas, or IMAP UIDs for Simafri), interrupted
// sends → uncertain, linking, non-delivery reports. Microsoft only, once a day: certificate
// expiry alerts. Only the configured provider runs.
export const CERT_THRESHOLDS = [30, 14, 7, 1, 0];
export function daysLeft(notAfter: Date, now = Date.now()) {
  return Math.floor((notAfter.getTime() - now) / 86_400_000);
}
// The strictest threshold reached (e.g. 6 days left → 7), or null.
export function certThreshold(notAfter: Date, now = Date.now()) {
  const left = daysLeft(notAfter, now);
  return [...CERT_THRESHOLDS].reverse().find((t) => left <= t) ?? null;
}
export async function certificateAlerts(store: MailStore, creds: Credential[], now = Date.now(), send?: (subject: string, text: string) => Promise<string>) {
  const sent: string[] = [];
  for (const cred of creds) {
    const threshold = certThreshold(cred.notAfter, now);
    if (threshold === null) continue;
    const left = daysLeft(cred.notAfter, now);
    const subject = left < 0 ? `CRM : certificat Microsoft « ${cred.name} » expiré` : `CRM : certificat Microsoft « ${cred.name} » expire dans ${left} jour(s)`;
    const text = `${subject} (fin de validité ${cred.notAfter.toISOString().slice(0, 10)}).\n` +
      `Procédure de renouvellement sans coupure : documentation/microsoft365.md, section 10.\n` +
      `Sans renouvellement, la synchronisation et l’envoi depuis contact@ s’arrêteront.`;
    let state = "banner-only";
    if (send) state = await send(subject, text).catch(() => "uncertain");
    // Recorded after the attempt: one message per threshold and certificate.
    if (await store.certAlert(cred.name, threshold, cred.notAfter, state)) sent.push(`${cred.name}:${threshold}:${state}`);
  }
  return sent;
}

export function startMailWorker() {
  const status = mailStatus();
  if (!status.enabled) return;
  const deps = mailDeps(database());
  if (!deps) return;
  const alertTo = (process.env.MAIL_ALERT_TO ?? "").trim();
  let stopping = false, timer: ReturnType<typeof setTimeout> | undefined, lastCertCheck = 0;
  const poll = async () => {
    try {
      const r = isImap(deps) ? await imapSyncAll(deps.imap, deps.store) : await syncAll(deps.graph, deps.store);
      const errors = r.results.filter((x) => x.error || x.reset).map((x) => `${x.folder}:${x.error ?? "reset"}`);
      if (errors.length) console.error("crm-mail: sync", errors.join(" "));
    } catch {
      console.error("crm-mail: sync-unavailable");
    }
    if (status.provider === "graph" && Date.now() - lastCertCheck > 86_400_000) {
      lastCertCheck = Date.now();
      try {
        const send = alertTo && process.env.SMTP_ENABLED === "true"
          ? async (subject: string, text: string) => {
              const t = contactSMTPTransport();
              try {
                const info = await t.sendMail({ to: alertTo, from: "no-reply@5sursync.com", subject, text, messageId: `<crm-cert-${randomUUID()}@5sursync.com>` });
                return info.accepted.length ? "accepted" : "failed";
              } finally { t.close(); }
            }
          : undefined;
        await certificateAlerts(deps.store, [status.config.read, status.config.send], Date.now(), send);
      } catch {
        console.error("crm-mail: certificate-check-unavailable");
      }
    }
    if (!stopping) { timer = setTimeout(() => void poll(), 120_000); timer.unref(); }
  };
  process.once("SIGTERM", () => { stopping = true; if (timer) clearTimeout(timer); });
  void poll();
}
