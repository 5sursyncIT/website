import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// CRM ↔ shared mailbox contact@ (documentation/microsoft365.md), additive.
// - admins.mail_access: none / read / draft / send (Payload field). The owner named in
//   CLAUDE.md receives "send"; every other account starts with "none".
// - schema crm_mail: Microsoft identifiers and metadata only. No message body, no body
//   preview, no attachment is ever stored (drafts included: their text stays in the
//   Drafts folder of the mailbox). Closed to PUBLIC, including future objects.
// pages_copy is deliberately left unchanged (see 20261008_090825_crm).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_admins_mail_access" AS ENUM('none', 'read', 'draft', 'send');
  ALTER TABLE "admins" ADD COLUMN "mail_access" "enum_admins_mail_access" DEFAULT 'none' NOT NULL;
  UPDATE "admins" SET "mail_access" = 'send' WHERE lower("email") = 'ydiop@5sursync.com';

  CREATE SCHEMA crm_mail;
  REVOKE ALL ON SCHEMA crm_mail FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA crm_mail REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA crm_mail REVOKE ALL ON SEQUENCES FROM PUBLIC;
  -- New functions keep PostgreSQL's global EXECUTE-to-PUBLIC default (not revocable per
  -- schema); without USAGE on crm_mail, no other role can reach them anyway.

  CREATE TABLE crm_mail.sync_state (
   folder text PRIMARY KEY CHECK (folder IN ('inbox','sentitems')),
   initial_since timestamptz NOT NULL,
   delta_link text, next_link text, lease_until timestamptz,
   last_run_at timestamptz, last_success_at timestamptz,
   last_error text, last_error_at timestamptz,
   messages_seen bigint NOT NULL DEFAULT 0);

  CREATE TABLE crm_mail.messages (
   id bigserial PRIMARY KEY,
   graph_id text NOT NULL UNIQUE,
   internet_message_id text, conversation_id text,
   folder text NOT NULL CHECK (folder IN ('inbox','sentitems')),
   from_address text, from_name text,
   to_addresses jsonb NOT NULL DEFAULT '[]', cc_addresses jsonb NOT NULL DEFAULT '[]',
   subject text NOT NULL DEFAULT '',
   received_at timestamptz, sent_at timestamptz,
   has_attachments boolean NOT NULL DEFAULT false,
   is_ndr boolean NOT NULL DEFAULT false, ndr_checked boolean NOT NULL DEFAULT false,
   ndr_recipients jsonb NOT NULL DEFAULT '[]',
   link_state text NOT NULL DEFAULT 'pending' CHECK (link_state IN ('pending','linked','ambiguous','unknown','ignored')),
   removed_at timestamptz,
   first_seen_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
  CREATE INDEX crm_mail_messages_conversation ON crm_mail.messages(conversation_id);
  CREATE INDEX crm_mail_messages_imid ON crm_mail.messages(internet_message_id);
  CREATE INDEX crm_mail_messages_date ON crm_mail.messages(COALESCE(received_at, sent_at) DESC);
  CREATE INDEX crm_mail_messages_link_state ON crm_mail.messages(link_state) WHERE removed_at IS NULL;

  CREATE TABLE crm_mail.links (
   message_id bigint PRIMARY KEY REFERENCES crm_mail.messages(id) ON DELETE CASCADE,
   client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
   contact_id integer REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
   method text NOT NULL CHECK (method IN ('auto','manual','draft')),
   linked_by integer REFERENCES public.admins(id) ON DELETE SET NULL,
   linked_at timestamptz NOT NULL DEFAULT NOW());
  CREATE INDEX crm_mail_links_client ON crm_mail.links(client_id);
  CREATE INDEX crm_mail_links_contact ON crm_mail.links(contact_id);

  CREATE TABLE crm_mail.drafts (
   id bigserial PRIMARY KEY,
   graph_id text NOT NULL UNIQUE,
   internet_message_id text, conversation_id text,
   kind text NOT NULL CHECK (kind IN ('new','reply')),
   reply_to bigint REFERENCES crm_mail.messages(id) ON DELETE SET NULL,
   client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
   contact_id integer REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
   to_addresses jsonb NOT NULL DEFAULT '[]', cc_addresses jsonb NOT NULL DEFAULT '[]',
   subject text NOT NULL DEFAULT '',
   -- Exchange version written by the CRM: a different one means edited in Outlook.
   change_key text,
   state text NOT NULL DEFAULT 'draft'
     CHECK (state IN ('draft','sending','accepted','in_sent','failed','uncertain','discarded')),
   prepared_by integer REFERENCES public.admins(id) ON DELETE SET NULL,
   prepared_at timestamptz NOT NULL DEFAULT NOW(),
   updated_by integer REFERENCES public.admins(id) ON DELETE SET NULL,
   updated_at timestamptz NOT NULL DEFAULT NOW(),
   submitted_by integer REFERENCES public.admins(id) ON DELETE SET NULL, submitted_at timestamptz,
   send_requested_by integer REFERENCES public.admins(id) ON DELETE SET NULL, send_requested_at timestamptz,
   claim uuid, lease_until timestamptz,
   accepted_at timestamptz, in_sent_at timestamptz, failure_code text,
   delivery_failed_at timestamptz, delivery_failed_for jsonb NOT NULL DEFAULT '[]');
  CREATE INDEX crm_mail_drafts_state ON crm_mail.drafts(state);
  CREATE INDEX crm_mail_drafts_client ON crm_mail.drafts(client_id);
  CREATE INDEX crm_mail_drafts_imid ON crm_mail.drafts(internet_message_id);

  -- Append-only journal: who prepared, edited, submitted, sent, linked.
  CREATE TABLE crm_mail.events (
   id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT NOW(),
   admin_id integer, channel text NOT NULL DEFAULT 'crm', action text NOT NULL,
   draft_id bigint, message_id bigint, detail jsonb NOT NULL DEFAULT '{}');
  CREATE INDEX crm_mail_events_draft ON crm_mail.events(draft_id);

  -- Addresses rejected by a non-delivery report: no send until lifted by a person.
  CREATE TABLE crm_mail.suppressions (
   address text PRIMARY KEY, reason text NOT NULL, ndr_message_id bigint,
   created_at timestamptz NOT NULL DEFAULT NOW(),
   lifted_by integer REFERENCES public.admins(id) ON DELETE SET NULL, lifted_at timestamptz);

  CREATE TABLE crm_mail.cert_alerts (
   credential text NOT NULL, threshold integer NOT NULL, not_after timestamptz NOT NULL,
   sent_at timestamptz NOT NULL DEFAULT NOW(), state text NOT NULL,
   PRIMARY KEY (credential, threshold, not_after));`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP SCHEMA IF EXISTS crm_mail CASCADE;
  ALTER TABLE "admins" DROP COLUMN IF EXISTS "mail_access";
  DROP TYPE IF EXISTS "public"."enum_admins_mail_access";`)
}
