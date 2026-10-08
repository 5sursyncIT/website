import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { normalizeSearch } from '../lib/crm'
// CRM v2 (additive): quotes/invoices, task reminders, accent- and typo-tolerant search.
// pages_copy is deliberately left unchanged (see 20261008_090825_crm).
const searchSources = {
  clients: ['name', 'email', 'phone', 'city', 'sector', 'registration'],
  crm_contacts: ['name', 'job_title', 'email', 'phone'],
  crm_deals: ['title', 'notes'],
} as const

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_documents_kind" AS ENUM('quote', 'invoice');
  CREATE TYPE "public"."enum_crm_documents_status" AS ENUM('draft', 'sent', 'accepted', 'refused', 'issued', 'paid', 'cancelled');
  CREATE TABLE "crm_documents_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"description" varchar NOT NULL,
  	"quantity" numeric NOT NULL,
  	"unit" varchar,
  	"unit_price" numeric NOT NULL
  );
  
  CREATE TABLE "crm_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_crm_documents_kind" NOT NULL,
  	"number" varchar,
  	"status" "enum_crm_documents_status" DEFAULT 'draft' NOT NULL,
  	"title" varchar NOT NULL,
  	"client_id" integer NOT NULL,
  	"contact_id" integer,
  	"deal_id" integer,
  	"source_quote_id" integer,
  	"issue_date" timestamp(3) with time zone,
  	"valid_until" timestamp(3) with time zone,
  	"due_date" timestamp(3) with time zone,
  	"vat_rate" numeric DEFAULT 18,
  	"subtotal" numeric,
  	"vat" numeric,
  	"total" numeric,
  	"conditions" varchar,
  	"paid_at" timestamp(3) with time zone,
  	"payment_note" varchar,
  	"notes" varchar,
  	"search_text" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "crm_deals" ADD COLUMN "search_text" varchar;
  ALTER TABLE "crm_contacts" ADD COLUMN "search_text" varchar;
  ALTER TABLE "crm_activities" ADD COLUMN "remind" boolean DEFAULT true;
  ALTER TABLE "clients" ADD COLUMN "search_text" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_documents_id" integer;
  ALTER TABLE "crm_documents_lines" ADD CONSTRAINT "crm_documents_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_documents" ADD CONSTRAINT "crm_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_documents" ADD CONSTRAINT "crm_documents_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_documents" ADD CONSTRAINT "crm_documents_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_documents" ADD CONSTRAINT "crm_documents_source_quote_id_crm_documents_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."crm_documents"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "crm_documents_lines_order_idx" ON "crm_documents_lines" USING btree ("_order");
  CREATE INDEX "crm_documents_lines_parent_id_idx" ON "crm_documents_lines" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "crm_documents_number_idx" ON "crm_documents" USING btree ("number");
  CREATE INDEX "crm_documents_status_idx" ON "crm_documents" USING btree ("status");
  CREATE INDEX "crm_documents_client_idx" ON "crm_documents" USING btree ("client_id");
  CREATE INDEX "crm_documents_contact_idx" ON "crm_documents" USING btree ("contact_id");
  CREATE INDEX "crm_documents_deal_idx" ON "crm_documents" USING btree ("deal_id");
  CREATE INDEX "crm_documents_source_quote_idx" ON "crm_documents" USING btree ("source_quote_id");
  CREATE INDEX "crm_documents_due_date_idx" ON "crm_documents" USING btree ("due_date");
  CREATE INDEX "crm_documents_updated_at_idx" ON "crm_documents" USING btree ("updated_at");
  CREATE INDEX "crm_documents_created_at_idx" ON "crm_documents" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_documents_fk" FOREIGN KEY ("crm_documents_id") REFERENCES "public"."crm_documents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_documents_id");`)
  // Hand-written: trigram search and the reminder mail ledger (outside Payload, like app_contact_*).
  await db.execute(sql`
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX "clients_search_trgm" ON "clients" USING gin ("search_text" gin_trgm_ops);
  CREATE INDEX "crm_contacts_search_trgm" ON "crm_contacts" USING gin ("search_text" gin_trgm_ops);
  CREATE INDEX "crm_deals_search_trgm" ON "crm_deals" USING gin ("search_text" gin_trgm_ops);
  CREATE INDEX "crm_documents_search_trgm" ON "crm_documents" USING gin ("search_text" gin_trgm_ops);
  CREATE TABLE app_crm_reminders (
   activity_id integer NOT NULL REFERENCES crm_activities(id) ON DELETE CASCADE,
   due_at timestamptz NOT NULL, recipient text NOT NULL, claim uuid NOT NULL, message_id text UNIQUE NOT NULL,
   state text NOT NULL CHECK(state IN('dispatching','accepted','failed','uncertain')),
   lease_until timestamptz NOT NULL, error_code text NOT NULL DEFAULT '',
   created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
   PRIMARY KEY (activity_id, due_at));
  CREATE TABLE app_crm_digests (
   admin_id integer NOT NULL REFERENCES admins(id) ON DELETE CASCADE, day date NOT NULL,
   recipient text NOT NULL, claim uuid NOT NULL, message_id text UNIQUE NOT NULL,
   state text NOT NULL CHECK(state IN('dispatching','accepted','failed','uncertain')),
   lease_until timestamptz NOT NULL, error_code text NOT NULL DEFAULT '',
   created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
   PRIMARY KEY (admin_id, day));`)
  // Existing rows: same normalisation as the collection hooks (src/lib/crm.ts).
  for (const [table, columns] of Object.entries(searchSources)) {
    const result = await db.execute(sql.raw(`SELECT id, ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}"`))
    for (const row of result.rows as Record<string, unknown>[])
      await db.execute(sql`UPDATE ${sql.identifier(table)} SET search_text = ${normalizeSearch(...columns.map((c) => row[c]))} WHERE id = ${row.id}`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE app_crm_digests;
  DROP TABLE app_crm_reminders;
  DROP INDEX IF EXISTS "clients_search_trgm";
  DROP INDEX IF EXISTS "crm_contacts_search_trgm";
  DROP INDEX IF EXISTS "crm_deals_search_trgm";
   ALTER TABLE "crm_documents_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_documents" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_documents_lines" CASCADE;
  DROP TABLE "crm_documents" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_documents_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_documents_id_idx";
  ALTER TABLE "crm_deals" DROP COLUMN "search_text";
  ALTER TABLE "crm_contacts" DROP COLUMN "search_text";
  ALTER TABLE "crm_activities" DROP COLUMN "remind";
  ALTER TABLE "clients" DROP COLUMN "search_text";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_documents_id";
  DROP TYPE "public"."enum_crm_documents_kind";
  DROP TYPE "public"."enum_crm_documents_status";`)
}
