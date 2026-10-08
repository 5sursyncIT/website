// PostgreSQL check of the reminder ledger (claim once, due-date change, digest once a
// day). Throwaway *_test database after migrations; fixture rows only; no SMTP.
import "./guard";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { PgReminderRepository, deliverOne, reminderStates } from "../src/lib/crm-reminders";
const pool = new Pool({ connectionString: process.env.DATABASE_URI });
const q = (text: string, values?: unknown[]) => pool.query(text, values);
let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks++; console.log("PASS " + message); };
try {
  const admin = (await q(`INSERT INTO admins(name,email,hash,salt,updated_at,created_at) VALUES('Rappel Fixture',$1,'x','x',NOW(),NOW()) RETURNING id`, [`rappel-${Date.now()}@example.test`])).rows[0].id;
  const client = (await q(`INSERT INTO clients(name,stage,updated_at,created_at) VALUES('Rappel SARL','client',NOW(),NOW()) RETURNING id`)).rows[0].id;
  const task = async (subject: string, due: string) =>
    (await q(`INSERT INTO crm_activities(kind,subject,client_id,due_at,done,remind,author_id,updated_at,created_at)
      VALUES('task',$1,$2,NOW()+$3::interval,false,true,$4,NOW(),NOW()) RETURNING id`, [subject, client, due, admin])).rows[0].id;
  const soon = await task("Dans 10 minutes", "10 minutes");
  const later = await task("Dans 3 heures", "3 hours");
  const old = await task("Vieille de 3 jours", "-3 days");
  const muted = await task("Sans rappel", "5 minutes");
  await q(`UPDATE crm_activities SET remind=false WHERE id=$1`, [muted]);
  const sent: string[] = [];
  const repo = new PgReminderRepository(pool, 0);
  const send = async (mail: { to: string; subject: string }) => { sent.push(mail.subject); return { accepted: [mail.to] }; };
  while (await deliverOne(repo, send));
  ok(sent.some((s) => s.includes("Dans 10 minutes")), "task due in 10 minutes reminded");
  ok(!sent.some((s) => /3 heures|3 jours|Sans rappel/.test(s)), "later, too old and muted tasks not reminded");
  ok(sent.filter((s) => s.startsWith("CRM : ")).length === 1, "one daily digest for the admin");
  const states = await reminderStates(pool, [soon, later, old, muted]);
  ok(states.get(soon) === "accepted" && states.size === 1, "state recorded as SMTP accepted, only for the reminded task");
  sent.length = 0;
  while (await deliverOne(repo, send));
  ok(sent.length === 0, "nothing sent twice");
  await q(`UPDATE crm_activities SET due_at=NOW()+INTERVAL '20 minutes' WHERE id=$1`, [soon]);
  while (await deliverOne(repo, send));
  ok(sent.length === 1 && (await reminderStates(pool, [soon])).get(soon) === "accepted", "new due date gets one new reminder");
  // An interrupted send (lease expired while dispatching) becomes uncertain and is never resent.
  const crash = await task("Envoi interrompu", "1 minute");
  const job = await repo.claimReminder();
  ok(job?.task.id === crash, "claimed before the crash");
  await q(`UPDATE app_crm_reminders SET lease_until=NOW()-INTERVAL '1 second' WHERE activity_id=$1`, [crash]);
  sent.length = 0;
  while (await deliverOne(repo, send));
  ok(sent.length === 0 && (await reminderStates(pool, [crash])).get(crash) === "uncertain", "interrupted reminder marked uncertain, not resent");
  console.log(`${checks} reminder checks passed`);
} finally {
  await pool.end();
}
