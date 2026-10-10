import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres';
// Backup and restore log, written by deployment/backup.sh and deployment/restore-test.sh.
// The /crm/systeme page reads it so "last backup" and "last RESTORE actually tested" are
// recorded facts, not deductions: listing a dump file never proves it can be restored.
// Deliberately outside Payload (no collection): it is written by shell, not by the app.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
CREATE TABLE app_backup_events (
 id bigserial PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN('backup','restore-test')),
 outcome text NOT NULL CHECK(outcome IN('ok','failed')),
 reference text NOT NULL DEFAULT '',
 size_bytes bigint,
 detail text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT NOW());
CREATE INDEX app_backup_events_recent ON app_backup_events(kind, created_at DESC);`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS app_backup_events;`)
}
