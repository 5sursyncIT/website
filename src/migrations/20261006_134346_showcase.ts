import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_projects_status" AS ENUM('completed', 'contract', 'ongoing', 'upcoming');
  CREATE TYPE "public"."enum_projects_builtin_logo" AS ENUM('ina-guinee', 'mairie-dakar', 'rtg', 'guce-anapi', 'harmattan-erp', 'cnts');
  CREATE TYPE "public"."enum_case_studies_illustration" AS ENUM('infrastructure', 'web');
  CREATE TABLE "projects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"country" varchar NOT NULL,
  	"mission" varchar NOT NULL,
  	"status" "enum_projects_status" DEFAULT 'completed' NOT NULL,
  	"logo_id" integer,
  	"builtin_logo" "enum_projects_builtin_logo",
  	"order" numeric DEFAULT 0,
  	"published" boolean DEFAULT true,
  	"show_on_home" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "case_studies_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "case_studies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client" varchar NOT NULL,
  	"category" varchar,
  	"project" varchar NOT NULL,
  	"summary" varchar NOT NULL,
  	"image_id" integer,
  	"illustration" "enum_case_studies_illustration",
  	"anchor" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"published" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "projects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "case_studies_id" integer;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "case_studies_tags" ADD CONSTRAINT "case_studies_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies" ADD CONSTRAINT "case_studies_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "projects_logo_idx" ON "projects" USING btree ("logo_id");
  CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");
  CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");
  CREATE INDEX "case_studies_tags_order_idx" ON "case_studies_tags" USING btree ("_order");
  CREATE INDEX "case_studies_tags_parent_id_idx" ON "case_studies_tags" USING btree ("_parent_id");
  CREATE INDEX "case_studies_image_idx" ON "case_studies" USING btree ("image_id");
  CREATE UNIQUE INDEX "case_studies_anchor_idx" ON "case_studies" USING btree ("anchor");
  CREATE INDEX "case_studies_updated_at_idx" ON "case_studies" USING btree ("updated_at");
  CREATE INDEX "case_studies_created_at_idx" ON "case_studies" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_projects_fk" FOREIGN KEY ("projects_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_case_studies_fk" FOREIGN KEY ("case_studies_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("projects_id");
  CREATE INDEX "payload_locked_documents_rels_case_studies_id_idx" ON "payload_locked_documents_rels" USING btree ("case_studies_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "case_studies_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "case_studies" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "projects" CASCADE;
  DROP TABLE "case_studies_tags" CASCADE;
  DROP TABLE "case_studies" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_projects_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_case_studies_fk";
  
  DROP INDEX "payload_locked_documents_rels_projects_id_idx";
  DROP INDEX "payload_locked_documents_rels_case_studies_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "projects_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "case_studies_id";
  DROP TYPE "public"."enum_projects_status";
  DROP TYPE "public"."enum_projects_builtin_logo";
  DROP TYPE "public"."enum_case_studies_illustration";`)
}
