import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres';
export async function up({db}:MigrateUpArgs){await db.execute(sql`
CREATE TABLE app_contact_submissions (
 submission_key uuid PRIMARY KEY, body_hash char(64) NOT NULL,
 contact_id integer UNIQUE NOT NULL REFERENCES contact_requests(id) ON DELETE CASCADE,
 origin text NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW());
CREATE TABLE app_contact_mail_attempts (
 contact_id integer PRIMARY KEY REFERENCES contact_requests(id) ON DELETE CASCADE,
 claim uuid NOT NULL, message_id text UNIQUE NOT NULL,
 state text NOT NULL CHECK(state IN('dispatching','accepted','failed','uncertain')),
 lease_until timestamptz NOT NULL, error_code text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
CREATE INDEX app_contact_mail_expiry ON app_contact_mail_attempts(lease_until) WHERE state='dispatching';
`);}
export async function down({db}:MigrateDownArgs){await db.execute(sql`DROP TABLE app_contact_mail_attempts;DROP TABLE app_contact_submissions;`);}
