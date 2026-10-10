import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// CRM ↔ contact@crm.5sursync.com through SMTP/IMAP (Simafri), additive. Microsoft rows
// keep provider 'graph' and are not modified. Still no body, preview or attachment content
// stored: only identifiers, headers needed for threads, and attachment names/sizes.
// - sync_state: IMAP rows 'imap-inbox' / 'imap-sentitems' (UIDVALIDITY + last UID seen),
//   separate from the Microsoft delta rows.
// - messages / drafts: provider, IMAP location, In-Reply-To / References.
// - drafts: copy in Sent (SMTP acceptance and Sent copy are distinct facts), kind of
//   delivery failure (address does not exist vs transport blocked).
// pages_copy is deliberately left unchanged (see 20261008_090825_crm).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE crm_mail.sync_state DROP CONSTRAINT IF EXISTS sync_state_folder_check;
  ALTER TABLE crm_mail.sync_state ADD CONSTRAINT sync_state_folder_check
    CHECK (folder IN ('inbox','sentitems','imap-inbox','imap-sentitems'));
  ALTER TABLE crm_mail.sync_state ADD COLUMN imap_path text, ADD COLUMN uidvalidity bigint,
    ADD COLUMN last_uid bigint NOT NULL DEFAULT 0;

  ALTER TABLE crm_mail.messages
    ADD COLUMN provider text NOT NULL DEFAULT 'graph' CHECK (provider IN ('graph','imap')),
    ADD COLUMN imap_uidvalidity bigint, ADD COLUMN imap_uid bigint,
    ADD COLUMN in_reply_to text, ADD COLUMN references_ids jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN ndr_kind text;
  CREATE INDEX crm_mail_messages_imap ON crm_mail.messages(folder, imap_uidvalidity, imap_uid) WHERE provider = 'imap';

  ALTER TABLE crm_mail.drafts
    ADD COLUMN provider text NOT NULL DEFAULT 'graph' CHECK (provider IN ('graph','imap')),
    ADD COLUMN in_reply_to text, ADD COLUMN references_ids jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN sent_copy text CHECK (sent_copy IN ('saved','found','failed')),
    ADD COLUMN delivery_failure_kind text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM crm_mail.sync_state WHERE folder LIKE 'imap-%';
  ALTER TABLE crm_mail.sync_state DROP CONSTRAINT IF EXISTS sync_state_folder_check;
  ALTER TABLE crm_mail.sync_state ADD CONSTRAINT sync_state_folder_check CHECK (folder IN ('inbox','sentitems'));
  ALTER TABLE crm_mail.sync_state DROP COLUMN IF EXISTS imap_path, DROP COLUMN IF EXISTS uidvalidity, DROP COLUMN IF EXISTS last_uid;
  DROP INDEX IF EXISTS crm_mail.crm_mail_messages_imap;
  ALTER TABLE crm_mail.messages DROP COLUMN IF EXISTS provider, DROP COLUMN IF EXISTS imap_uidvalidity, DROP COLUMN IF EXISTS imap_uid,
    DROP COLUMN IF EXISTS in_reply_to, DROP COLUMN IF EXISTS references_ids, DROP COLUMN IF EXISTS ndr_kind;
  ALTER TABLE crm_mail.drafts DROP COLUMN IF EXISTS provider, DROP COLUMN IF EXISTS in_reply_to, DROP COLUMN IF EXISTS references_ids,
    DROP COLUMN IF EXISTS attachments, DROP COLUMN IF EXISTS sent_copy, DROP COLUMN IF EXISTS delivery_failure_kind;`)
}
