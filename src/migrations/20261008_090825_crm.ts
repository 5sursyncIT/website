import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// CRM (additive): three crm_* tables and nullable/defaulted columns on clients.
// Existing companies get stage = client. pages_copy is deliberately left unchanged.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_deals_stage" AS ENUM('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
  CREATE TYPE "public"."enum_crm_activities_kind" AS ENUM('call', 'email', 'meeting', 'note', 'task');
  CREATE TYPE "public"."enum_clients_stage" AS ENUM('prospect', 'client', 'inactive');
  CREATE TYPE "public"."enum_clients_source" AS ENUM('site-web', 'recommandation', 'prospection', 'appel-offres', 'partenaire', 'salon', 'autre');
  CREATE TABLE "crm_deals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"client_id" integer NOT NULL,
  	"contact_id" integer,
  	"amount" numeric DEFAULT 0,
  	"probability" numeric,
  	"expected_close" timestamp(3) with time zone,
  	"stage" "enum_crm_deals_stage" DEFAULT 'lead' NOT NULL,
  	"owner_id" integer,
  	"closed_at" timestamp(3) with time zone,
  	"lost_reason" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_contacts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"job_title" varchar,
  	"client_id" integer NOT NULL,
  	"email" varchar,
  	"phone" varchar,
  	"primary" boolean DEFAULT false,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_activities" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_crm_activities_kind" DEFAULT 'note' NOT NULL,
  	"subject" varchar NOT NULL,
  	"details" varchar,
  	"client_id" integer NOT NULL,
  	"deal_id" integer,
  	"contact_id" integer,
  	"request_id" integer,
  	"due_at" timestamp(3) with time zone,
  	"done" boolean DEFAULT false,
  	"done_at" timestamp(3) with time zone,
  	"assignee_id" integer,
  	"author_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "clients" ADD COLUMN "stage" "enum_clients_stage" DEFAULT 'client' NOT NULL;
  ALTER TABLE "clients" ADD COLUMN "owner_id" integer;
  ALTER TABLE "clients" ADD COLUMN "source" "enum_clients_source";
  ALTER TABLE "clients" ADD COLUMN "source_request_id" integer;
  ALTER TABLE "clients" ADD COLUMN "sector" varchar;
  ALTER TABLE "clients" ADD COLUMN "registration" varchar;
  ALTER TABLE "clients" ADD COLUMN "email" varchar;
  ALTER TABLE "clients" ADD COLUMN "phone" varchar;
  ALTER TABLE "clients" ADD COLUMN "website" varchar;
  ALTER TABLE "clients" ADD COLUMN "address" varchar;
  ALTER TABLE "clients" ADD COLUMN "city" varchar;
  ALTER TABLE "clients" ADD COLUMN "country" varchar;
  ALTER TABLE "clients" ADD COLUMN "notes" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_deals_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_contacts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_activities_id" integer;
  ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_owner_id_admins_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_request_id_contact_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."contact_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_assignee_id_admins_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_author_id_admins_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "crm_deals_client_idx" ON "crm_deals" USING btree ("client_id");
  CREATE INDEX "crm_deals_contact_idx" ON "crm_deals" USING btree ("contact_id");
  CREATE INDEX "crm_deals_stage_idx" ON "crm_deals" USING btree ("stage");
  CREATE INDEX "crm_deals_owner_idx" ON "crm_deals" USING btree ("owner_id");
  CREATE INDEX "crm_deals_updated_at_idx" ON "crm_deals" USING btree ("updated_at");
  CREATE INDEX "crm_deals_created_at_idx" ON "crm_deals" USING btree ("created_at");
  CREATE INDEX "crm_contacts_client_idx" ON "crm_contacts" USING btree ("client_id");
  CREATE INDEX "crm_contacts_updated_at_idx" ON "crm_contacts" USING btree ("updated_at");
  CREATE INDEX "crm_contacts_created_at_idx" ON "crm_contacts" USING btree ("created_at");
  CREATE INDEX "crm_activities_client_idx" ON "crm_activities" USING btree ("client_id");
  CREATE INDEX "crm_activities_deal_idx" ON "crm_activities" USING btree ("deal_id");
  CREATE INDEX "crm_activities_contact_idx" ON "crm_activities" USING btree ("contact_id");
  CREATE INDEX "crm_activities_request_idx" ON "crm_activities" USING btree ("request_id");
  CREATE INDEX "crm_activities_due_at_idx" ON "crm_activities" USING btree ("due_at");
  CREATE INDEX "crm_activities_done_idx" ON "crm_activities" USING btree ("done");
  CREATE INDEX "crm_activities_assignee_idx" ON "crm_activities" USING btree ("assignee_id");
  CREATE INDEX "crm_activities_author_idx" ON "crm_activities" USING btree ("author_id");
  CREATE INDEX "crm_activities_updated_at_idx" ON "crm_activities" USING btree ("updated_at");
  CREATE INDEX "crm_activities_created_at_idx" ON "crm_activities" USING btree ("created_at");
  ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_admins_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_source_request_id_contact_requests_id_fk" FOREIGN KEY ("source_request_id") REFERENCES "public"."contact_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_deals_fk" FOREIGN KEY ("crm_deals_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_contacts_fk" FOREIGN KEY ("crm_contacts_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_activities_fk" FOREIGN KEY ("crm_activities_id") REFERENCES "public"."crm_activities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "clients_stage_idx" ON "clients" USING btree ("stage");
  CREATE INDEX "clients_owner_idx" ON "clients" USING btree ("owner_id");
  CREATE INDEX "clients_source_request_idx" ON "clients" USING btree ("source_request_id");
  CREATE INDEX "payload_locked_documents_rels_crm_deals_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_deals_id");
  CREATE INDEX "payload_locked_documents_rels_crm_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_contacts_id");
  CREATE INDEX "payload_locked_documents_rels_crm_activities_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_activities_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_deals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_contacts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_activities" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_deals" CASCADE;
  DROP TABLE "crm_contacts" CASCADE;
  DROP TABLE "crm_activities" CASCADE;
  ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_owner_id_admins_id_fk";
  
  ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_source_request_id_contact_requests_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_deals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_contacts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_activities_fk";
  
  DROP INDEX IF EXISTS "clients_stage_idx";
  DROP INDEX IF EXISTS "clients_owner_idx";
  DROP INDEX IF EXISTS "clients_source_request_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_deals_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_contacts_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_activities_id_idx";
  ALTER TABLE "clients" DROP COLUMN "stage";
  ALTER TABLE "clients" DROP COLUMN "owner_id";
  ALTER TABLE "clients" DROP COLUMN "source";
  ALTER TABLE "clients" DROP COLUMN "source_request_id";
  ALTER TABLE "clients" DROP COLUMN "sector";
  ALTER TABLE "clients" DROP COLUMN "registration";
  ALTER TABLE "clients" DROP COLUMN "email";
  ALTER TABLE "clients" DROP COLUMN "phone";
  ALTER TABLE "clients" DROP COLUMN "website";
  ALTER TABLE "clients" DROP COLUMN "address";
  ALTER TABLE "clients" DROP COLUMN "city";
  ALTER TABLE "clients" DROP COLUMN "country";
  ALTER TABLE "clients" DROP COLUMN "notes";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_deals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_contacts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_activities_id";
  DROP TYPE "public"."enum_crm_deals_stage";
  DROP TYPE "public"."enum_crm_activities_kind";
  DROP TYPE "public"."enum_clients_stage";
  DROP TYPE "public"."enum_clients_source";`)
}
