import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { normalizeSearch } from '../lib/crm'
// CRM v3 (additive): credit notes, deposit invoices, partial payments, VAT per line,
// e-mailed documents ledger, search in notes and activities.
// pages_copy is deliberately left unchanged (see 20261008_090825_crm).
const searchSources = {
  clients: ['name', 'email', 'phone', 'city', 'sector', 'registration', 'notes'],
  crm_contacts: ['name', 'job_title', 'email', 'phone', 'notes'],
  crm_activities: ['subject', 'details'],
} as const

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_documents_invoice_type" AS ENUM('standard', 'deposit');
  ALTER TYPE "public"."enum_crm_documents_kind" ADD VALUE 'credit';
  CREATE TABLE "crm_documents_payments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone,
  	"amount" numeric,
  	"note" varchar
  );
  
  ALTER TABLE "crm_documents_lines" ADD COLUMN "vat_rate" numeric;
  ALTER TABLE "crm_documents" ADD COLUMN "invoice_type" "enum_crm_documents_invoice_type" DEFAULT 'standard';
  ALTER TABLE "crm_documents" ADD COLUMN "credit_for_id" integer;
  ALTER TABLE "crm_documents" ADD COLUMN "amount_paid" numeric;
  ALTER TABLE "crm_documents" ADD COLUMN "balance" numeric;
  ALTER TABLE "crm_activities" ADD COLUMN "search_text" varchar;
  ALTER TABLE "crm_documents_payments" ADD CONSTRAINT "crm_documents_payments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_documents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "crm_documents_payments_order_idx" ON "crm_documents_payments" USING btree ("_order");
  CREATE INDEX "crm_documents_payments_parent_id_idx" ON "crm_documents_payments" USING btree ("_parent_id");
  ALTER TABLE "crm_documents" ADD CONSTRAINT "crm_documents_credit_for_id_crm_documents_id_fk" FOREIGN KEY ("credit_for_id") REFERENCES "public"."crm_documents"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "crm_documents_credit_for_idx" ON "crm_documents" USING btree ("credit_for_id");
  CREATE INDEX "crm_documents_balance_idx" ON "crm_documents" USING btree ("balance");`)
  // Hand-written: activity search index and the ledger of e-mailed documents.
  await db.execute(sql`
  CREATE INDEX "crm_activities_search_trgm" ON "crm_activities" USING gin ("search_text" gin_trgm_ops);
  CREATE TABLE app_crm_document_mails (
   id serial PRIMARY KEY,
   document_id integer NOT NULL REFERENCES crm_documents(id) ON DELETE CASCADE,
   recipient text NOT NULL, subject text NOT NULL,
   sent_by integer REFERENCES admins(id) ON DELETE SET NULL,
   message_id text UNIQUE NOT NULL,
   state text NOT NULL CHECK(state IN('dispatching','accepted','failed','uncertain')),
   error_code text NOT NULL DEFAULT '',
   created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
  CREATE INDEX app_crm_document_mails_document ON app_crm_document_mails(document_id);
  -- v2 documents: lines take the document rate; invoices get their paid amount and balance.
  UPDATE crm_documents_lines l SET vat_rate = COALESCE(d.vat_rate, 18) FROM crm_documents d WHERE d.id = l._parent_id AND l.vat_rate IS NULL;
  INSERT INTO crm_documents_payments(_order, _parent_id, id, date, amount, note)
    SELECT 1, id, substr(md5('v3-payment-' || id), 1, 24), COALESCE(paid_at, updated_at), total, payment_note
    FROM crm_documents WHERE kind = 'invoice' AND status = 'paid';
  UPDATE crm_documents SET amount_paid = CASE WHEN status = 'paid' THEN total ELSE 0 END,
    balance = CASE WHEN status = 'paid' THEN 0 ELSE total END WHERE kind = 'invoice';`)
  // Search now includes notes and activities: recompute with the hooks' normalisation.
  for (const [table, columns] of Object.entries(searchSources)) {
    const result = await db.execute(sql.raw(`SELECT id, ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}"`))
    for (const row of result.rows as Record<string, unknown>[])
      await db.execute(sql`UPDATE ${sql.identifier(table)} SET search_text = ${normalizeSearch(...columns.map((c) => row[c]))} WHERE id = ${row.id}`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS app_crm_document_mails;
  -- Rolling back deletes credit notes (the "credit" kind cannot be kept): back up first.
  DELETE FROM crm_documents WHERE kind = 'credit';
  DROP INDEX IF EXISTS "crm_activities_search_trgm";
   ALTER TABLE "crm_documents_payments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_documents_payments" CASCADE;
  ALTER TABLE "crm_documents" DROP CONSTRAINT IF EXISTS "crm_documents_credit_for_id_crm_documents_id_fk";
  
  ALTER TABLE "crm_documents" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_documents_kind";
  CREATE TYPE "public"."enum_crm_documents_kind" AS ENUM('quote', 'invoice');
  ALTER TABLE "crm_documents" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_crm_documents_kind" USING "kind"::"public"."enum_crm_documents_kind";
  DROP INDEX IF EXISTS "crm_documents_credit_for_idx";
  DROP INDEX IF EXISTS "crm_documents_balance_idx";
  ALTER TABLE "crm_documents_lines" DROP COLUMN "vat_rate";
  ALTER TABLE "crm_documents" DROP COLUMN "invoice_type";
  ALTER TABLE "crm_documents" DROP COLUMN "credit_for_id";
  ALTER TABLE "crm_documents" DROP COLUMN "amount_paid";
  ALTER TABLE "crm_documents" DROP COLUMN "balance";
  ALTER TABLE "crm_activities" DROP COLUMN "search_text";
  DROP TYPE "public"."enum_crm_documents_invoice_type";`)
}
