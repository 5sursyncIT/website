import { contactSMTPTransport } from './contact-smtp';
import { crmRemindersEnabled, deliverOne, PgReminderRepository } from './crm-reminders';
import { database } from './database';
// Off unless CRM_EMAIL_ENABLED=true on the production instance (approved SMTP only).
// Preproduction shares the database but never claims anything, so it cannot mark a reminder.
export function startCRMReminderWorker() {
  if (!crmRemindersEnabled() || process.env.BUILD_MODE === '1') return;
  let transport: ReturnType<typeof contactSMTPTransport>;
  try { transport = contactSMTPTransport(); } catch { console.error('crm-reminders: configuration-unavailable'); return; }
  const repository = new PgReminderRepository(database());
  let stopping = false; let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try { for (let count = 0; count < 10 && !stopping; count++) if (!await deliverOne(repository, mail => transport.sendMail(mail))) break; }
    catch { console.error('crm-reminders: processing-unavailable'); }
    if (!stopping) { timer = setTimeout(() => void poll(), 60000); timer.unref(); }
  };
  process.once('SIGTERM', () => { stopping = true; if (timer) clearTimeout(timer); });
  void poll();
}
