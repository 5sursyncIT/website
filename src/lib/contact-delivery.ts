import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { z } from 'zod';
import type { contactSchema } from './validation';
// `service` is optional for callers: the public schema defaults it to "" and
// recordContact stores NULL when there is none (request sent outside a service page).
export type ContactInput = Omit<z.infer<typeof contactSchema>, 'website' | 'service'> & { service?: string | null };
export class SubmissionConflict extends Error {}
export function contactNotificationsEnabled(env: Record<string,string|undefined> = process.env): boolean {
  return env.APP_ORIGIN === 'https://5sursync.com' && env.SMTP_ENABLED === 'true'
    && env.CONTACT_NOTIFICATIONS_ENABLED === 'true' && env.CONTACT_NOTIFICATION_TO === 'contact@5sursync.com';
}
export async function recordContact(pool: Pool, input: ContactInput, key: string, origin: string, enabled: boolean) {
  key = key.toLowerCase();
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
    const previous = await connection.query('SELECT body_hash,contact_id FROM app_contact_submissions WHERE submission_key=$1', [key]);
    if (previous.rowCount) {
      if (previous.rows[0].body_hash !== hash) throw new SubmissionConflict('Identifiant déjà utilisé pour une autre demande.');
      await connection.query('COMMIT');
      return { id: Number(previous.rows[0].contact_id), duplicate: true };
    }
    const created = await connection.query(`INSERT INTO contact_requests(name,company,email,phone,topic,service,message,notification,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING id`,
      [input.name,input.company,input.email,input.phone,input.topic,input.service || null,input.message,enabled ? 'pending' : 'not-configured']);
    const id = Number(created.rows[0].id);
    await connection.query('INSERT INTO app_contact_submissions(submission_key,body_hash,contact_id,origin) VALUES($1,$2,$3,$4)', [key,hash,id,origin]);
    await connection.query('COMMIT');
    return { id, duplicate: false };
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally { connection.release(); }
}
export type MailJob = { contactID: number; claim: string; messageID: string; topic: string };
export interface MailRepository {
  claim(): Promise<MailJob | null>;
  finish(job: MailJob, state: 'accepted' | 'failed' | 'uncertain', code: string): Promise<void>;
}
export class ContactMailRepository implements MailRepository {
  constructor(private readonly pool: Pool) {}
  async claim(): Promise<MailJob | null> {
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      // An expired dispatch may have reached SMTP. Never resend it automatically.
      await connection.query(`WITH expired AS (
        UPDATE app_contact_mail_attempts SET state='uncertain',error_code='interrupted',updated_at=NOW()
        WHERE state='dispatching' AND lease_until<NOW() RETURNING contact_id)
        UPDATE contact_requests SET notification='failed',updated_at=NOW() WHERE id IN(SELECT contact_id FROM expired)`);
      const candidate = await connection.query(`SELECT c.id,c.topic FROM contact_requests c
        JOIN app_contact_submissions s ON s.contact_id=c.id
        LEFT JOIN app_contact_mail_attempts m ON m.contact_id=c.id
        WHERE c.notification='pending' AND s.origin='https://5sursync.com' AND m.contact_id IS NULL
        ORDER BY c.id LIMIT 1 FOR UPDATE OF c SKIP LOCKED`);
      if (!candidate.rowCount) { await connection.query('COMMIT'); return null; }
      const contactID = Number(candidate.rows[0].id), claim = randomUUID();
      const messageID = `<contact-${contactID}@5sursync.com>`;
      await connection.query(`INSERT INTO app_contact_mail_attempts(contact_id,claim,message_id,state,lease_until)
        VALUES($1,$2,$3,'dispatching',NOW()+INTERVAL '5 minutes')`,[contactID,claim,messageID]);
      await connection.query('COMMIT');
      return { contactID, claim, messageID, topic: String(candidate.rows[0].topic) };
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
  async finish(job: MailJob, state: 'accepted' | 'failed' | 'uncertain', code: string) {
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      const result = await connection.query(`UPDATE app_contact_mail_attempts SET state=$3,error_code=$4,updated_at=NOW()
        WHERE contact_id=$1 AND claim=$2 AND state='dispatching' RETURNING contact_id`,[job.contactID,job.claim,state,code]);
      if (result.rowCount) await connection.query('UPDATE contact_requests SET notification=$2,updated_at=NOW() WHERE id=$1',[job.contactID,state==='accepted' ? 'sent' : 'failed']);
      await connection.query('COMMIT');
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
}
export type ContactMail = { to: string; from: string; subject: string; text: string; messageId: string };
export type SendContactMail = (mail: ContactMail) => Promise<{ accepted: string[] }>;
export async function deliverOne(repository: MailRepository, send: SendContactMail) {
  const job = await repository.claim();
  if (!job) return false;
  let state: 'accepted' | 'failed' | 'uncertain', code: string;
  try {
    const result = await send({to:'contact@5sursync.com',from:'no-reply@5sursync.com',
      subject:`Nouvelle demande 5/Sync IT #${job.contactID}`,
      text:`Une demande a été enregistrée.\nRéférence : ${job.contactID}\nSujet : ${job.topic}\nConsulter : https://5sursync.com/admin/collections/contact-requests/${job.contactID}`,
      messageId:job.messageID});
    state = result.accepted.map(x=>x.toLowerCase()).includes('contact@5sursync.com') ? 'accepted' : 'failed';
    code = state==='accepted' ? 'smtp-accepted' : 'recipient-not-accepted';
  } catch { state='uncertain'; code='transport-error'; }
  // A DB failure here leaves dispatching; expiry marks uncertainty without retry.
  await repository.finish(job,state,code);
  return true;
}
