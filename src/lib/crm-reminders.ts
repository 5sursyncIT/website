import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
// CRM task reminders by email, same delivery rules as contact notifications:
// one claim per message with a lease, never resent automatically, and the state
// recorded is what SMTP answered (accepted / failed / uncertain), never assumed.
// One switch for every CRM e-mail (task reminders, documents): production origin,
// approved SMTP, and CRM_EMAIL_ENABLED=true. Preproduction never sends.
export function crmEmailEnabled(env: Record<string, string | undefined> = process.env) {
  return env.APP_ORIGIN === "https://5sursync.com" && env.SMTP_ENABLED === "true" && env.CRM_EMAIL_ENABLED === "true";
}
export const crmRemindersEnabled = crmEmailEnabled;
export type ReminderState = "accepted" | "failed" | "uncertain";
export type TaskLine = { subject: string; kind: string; client: string; dueAt: Date };
export type ReminderJob = { type: "reminder"; key: [number, Date]; claim: string; messageID: string; recipient: string; task: TaskLine & { id: number } };
export type DigestJob = { type: "digest"; key: [number, string]; claim: string; messageID: string; recipient: string; tasks: TaskLine[]; day: string };
export type Job = ReminderJob | DigestJob;
export interface ReminderRepository {
  claimReminder(): Promise<ReminderJob | null>;
  claimDigest(): Promise<DigestJob | null>;
  finish(job: Job, state: ReminderState, code: string): Promise<void>;
}
export type ReminderMail = { to: string; from: string; subject: string; text: string; messageId: string };
export type SendReminder = (mail: ReminderMail) => Promise<{ accepted: string[] }>;
const ORIGIN = "https://5sursync.com";
// pg returns timestamptz as Date; String(date) would drop the milliseconds of the key.
const asDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const when = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Dakar" });
const hour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Dakar" });
const kinds: Record<string, string> = { call: "Appel", email: "Email", meeting: "Rendez-vous", note: "Note", task: "Tâche" };
export function reminderMail(job: Job): ReminderMail {
  const base = { to: job.recipient, from: "no-reply@5sursync.com", messageId: job.messageID };
  if (job.type === "reminder") {
    const t = job.task;
    return {
      ...base,
      subject: `Rappel CRM : ${t.subject}`.slice(0, 180),
      text: `${kinds[t.kind] ?? "Tâche"} prévue le ${when.format(t.dueAt)}\nEntreprise : ${t.client}\nObjet : ${t.subject}\n\nOuvrir les tâches : ${ORIGIN}/crm/taches\n\nMessage automatique du CRM 5/Sync IT. Décochez « Rappel par email » sur la tâche pour ne plus le recevoir.`,
    };
  }
  const now = Date.now();
  const late = job.tasks.filter((t) => t.dueAt.getTime() < now);
  const lines = job.tasks.map((t) => `- ${t.dueAt.getTime() < now ? "[EN RETARD] " : ""}${hour.format(t.dueAt)} · ${t.client} · ${t.subject}`);
  return {
    ...base,
    subject: `CRM : ${job.tasks.length} tâche${job.tasks.length > 1 ? "s" : ""} à traiter aujourd’hui${late.length ? ` (${late.length} en retard)` : ""}`,
    text: `Bonjour,\n\nVos tâches en retard ou prévues aujourd’hui :\n\n${lines.join("\n")}\n\nOuvrir les tâches : ${ORIGIN}/crm/taches?qui=moi\n\nRécapitulatif automatique du CRM 5/Sync IT, envoyé une fois par jour à partir de 7 h.`,
  };
}
export async function deliverOne(repository: ReminderRepository, send: SendReminder) {
  const job = (await repository.claimReminder()) ?? (await repository.claimDigest());
  if (!job) return false;
  let state: ReminderState, code: string;
  try {
    const result = await send(reminderMail(job));
    state = result.accepted.map((x) => x.toLowerCase()).includes(job.recipient.toLowerCase()) ? "accepted" : "failed";
    code = state === "accepted" ? "smtp-accepted" : "recipient-not-accepted";
  } catch {
    state = "uncertain";
    code = "transport-error";
  }
  // A DB failure here leaves "dispatching"; the lease expiry marks it uncertain, without resending.
  await repository.finish(job, state, code);
  return true;
}
// Open tasks are reminded from 30 minutes before their due time, up to one day late.
export class PgReminderRepository implements ReminderRepository {
  constructor(private readonly pool: Pool, private readonly digestHourUTC = 7) {}
  private async tx<T>(work: (q: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>) => Promise<T>) {
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await work((text, values) => connection.query(text, values));
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
  claimReminder() {
    return this.tx(async (q) => {
      await q(`UPDATE app_crm_reminders SET state='uncertain',error_code='interrupted',updated_at=NOW() WHERE state='dispatching' AND lease_until<NOW()`);
      const found = await q(`SELECT a.id,a.subject,a.kind,a.due_at,c.name AS client,COALESCE(asg.email,au.email) AS recipient
        FROM crm_activities a JOIN clients c ON c.id=a.client_id
        LEFT JOIN admins asg ON asg.id=a.assignee_id LEFT JOIN admins au ON au.id=a.author_id
        LEFT JOIN app_crm_reminders r ON r.activity_id=a.id AND r.due_at=a.due_at
        WHERE a.done=false AND a.remind=true AND a.due_at IS NOT NULL
          AND a.due_at<=NOW()+INTERVAL '30 minutes' AND a.due_at>NOW()-INTERVAL '1 day'
          AND r.activity_id IS NULL AND COALESCE(asg.email,au.email) IS NOT NULL
        ORDER BY a.due_at LIMIT 1 FOR UPDATE OF a SKIP LOCKED`);
      if (!found.rowCount) return null;
      const row = found.rows[0];
      const id = Number(row.id), dueAt = asDate(row.due_at), claim = randomUUID();
      const messageID = `<crm-reminder-${id}-${dueAt.getTime()}@5sursync.com>`;
      await q(`INSERT INTO app_crm_reminders(activity_id,due_at,recipient,claim,message_id,state,lease_until)
        VALUES($1,$2,$3,$4,$5,'dispatching',NOW()+INTERVAL '5 minutes')`, [id, dueAt, row.recipient, claim, messageID]);
      return {
        type: "reminder" as const, key: [id, dueAt] as [number, Date], claim, messageID, recipient: String(row.recipient),
        task: { id, subject: String(row.subject), kind: String(row.kind), client: String(row.client), dueAt },
      };
    });
  }
  // Once a day from 07:00 Dakar (UTC+0): each admin with open tasks late or due today.
  claimDigest() {
    if (new Date().getUTCHours() < this.digestHourUTC) return Promise.resolve(null);
    return this.tx(async (q) => {
      await q(`UPDATE app_crm_digests SET state='uncertain',error_code='interrupted',updated_at=NOW() WHERE state='dispatching' AND lease_until<NOW()`);
      const day = new Date().toISOString().slice(0, 10);
      const found = await q(`SELECT ad.id,ad.email FROM admins ad
        WHERE EXISTS (SELECT 1 FROM crm_activities a WHERE a.done=false AND a.due_at<($1::date+1)
          AND COALESCE(a.assignee_id,a.author_id)=ad.id)
        AND NOT EXISTS (SELECT 1 FROM app_crm_digests d WHERE d.admin_id=ad.id AND d.day=$1::date)
        ORDER BY ad.id LIMIT 1 FOR UPDATE OF ad SKIP LOCKED`, [day]);
      if (!found.rowCount) return null;
      const admin = Number(found.rows[0].id), recipient = String(found.rows[0].email);
      const tasks = await q(`SELECT a.subject,a.kind,a.due_at,c.name AS client FROM crm_activities a JOIN clients c ON c.id=a.client_id
        WHERE a.done=false AND a.due_at<($1::date+1) AND COALESCE(a.assignee_id,a.author_id)=$2
        ORDER BY a.due_at LIMIT 30`, [day, admin]);
      const claim = randomUUID(), messageID = `<crm-digest-${admin}-${day}@5sursync.com>`;
      await q(`INSERT INTO app_crm_digests(admin_id,day,recipient,claim,message_id,state,lease_until)
        VALUES($1,$2::date,$3,$4,$5,'dispatching',NOW()+INTERVAL '5 minutes')`, [admin, day, recipient, claim, messageID]);
      return {
        type: "digest" as const, key: [admin, day] as [number, string], claim, messageID, recipient, day,
        tasks: tasks.rows.map((t) => ({ subject: String(t.subject), kind: String(t.kind), client: String(t.client), dueAt: asDate(t.due_at) })),
      };
    });
  }
  async finish(job: Job, state: ReminderState, code: string) {
    const [table, keyA, keyB] = job.type === "reminder" ? ["app_crm_reminders", "activity_id", "due_at"] : ["app_crm_digests", "admin_id", "day"];
    await this.pool.query(
      `UPDATE ${table} SET state=$4,error_code=$5,updated_at=NOW() WHERE ${keyA}=$1 AND ${keyB}=$2 AND claim=$3 AND state='dispatching'`,
      [job.key[0], job.key[1], job.claim, state, code],
    );
  }
}
// Reminder state of each activity's current due date, for display in /crm.
export async function reminderStates(pool: Pool, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const { rows } = await pool.query(
    `SELECT r.activity_id,r.state FROM app_crm_reminders r JOIN crm_activities a ON a.id=r.activity_id AND a.due_at=r.due_at WHERE r.activity_id = ANY($1::int[])`,
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.activity_id), String(r.state)]));
}
