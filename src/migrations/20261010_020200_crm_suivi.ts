import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// Commercial follow-up of companies (/crm/suivi), additive:
// - clients.pipeline (stage), lost_reason, pipeline_at (date of the last stage change);
// - activity kind 'whatsapp'.
// Initial stage of the existing companies (choice of the owner, 2026-10-10):
// clients and former clients 'won'; prospects created from a website request 'engaged';
// prospects with a past call, email or meeting 'contacted'; the others 'to-contact'.
// pages_copy is deliberately left unchanged (see 20261008_090825_crm).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clients_pipeline" AS ENUM('to-contact', 'contacted', 'engaged', 'need', 'meeting', 'quote', 'on-hold', 'won', 'lost');
  CREATE TYPE "public"."enum_clients_lost_reason" AS ENUM('budget', 'no-need', 'competitor', 'price', 'no-answer', 'timing', 'other');
  ALTER TYPE "public"."enum_crm_activities_kind" ADD VALUE 'whatsapp' BEFORE 'meeting';
  ALTER TABLE "clients" ADD COLUMN "pipeline" "enum_clients_pipeline" DEFAULT 'to-contact';
  ALTER TABLE "clients" ADD COLUMN "lost_reason" "enum_clients_lost_reason";
  ALTER TABLE "clients" ADD COLUMN "pipeline_at" timestamp(3) with time zone;
  CREATE INDEX "clients_pipeline_idx" ON "clients" USING btree ("pipeline");
  UPDATE "clients" SET "pipeline" = 'won' WHERE "stage" IN ('client', 'inactive');
  UPDATE "clients" SET "pipeline" = 'engaged' WHERE "stage" = 'prospect' AND "source_request_id" IS NOT NULL;
  UPDATE "clients" c SET "pipeline" = 'contacted'
    WHERE c."stage" = 'prospect' AND c."pipeline" = 'to-contact'
      AND EXISTS (SELECT 1 FROM "crm_activities" a WHERE a."client_id" = c."id" AND a."done" AND a."kind" IN ('call', 'email', 'meeting'));`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // WhatsApp activities become notes (an enum value cannot be dropped in place).
  await db.execute(sql`
   ALTER TABLE "crm_activities" ALTER COLUMN "kind" SET DATA TYPE text;
  UPDATE "crm_activities" SET "kind" = 'note' WHERE "kind" = 'whatsapp';
  ALTER TABLE "crm_activities" ALTER COLUMN "kind" SET DEFAULT 'note'::text;
  DROP TYPE "public"."enum_crm_activities_kind";
  CREATE TYPE "public"."enum_crm_activities_kind" AS ENUM('call', 'email', 'meeting', 'note', 'task');
  ALTER TABLE "crm_activities" ALTER COLUMN "kind" SET DEFAULT 'note'::"public"."enum_crm_activities_kind";
  ALTER TABLE "crm_activities" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_crm_activities_kind" USING "kind"::"public"."enum_crm_activities_kind";
  DROP INDEX IF EXISTS "clients_pipeline_idx";
  ALTER TABLE "clients" DROP COLUMN IF EXISTS "pipeline";
  ALTER TABLE "clients" DROP COLUMN IF EXISTS "lost_reason";
  ALTER TABLE "clients" DROP COLUMN IF EXISTS "pipeline_at";
  DROP TYPE IF EXISTS "public"."enum_clients_pipeline";
  DROP TYPE IF EXISTS "public"."enum_clients_lost_reason";`)
}
