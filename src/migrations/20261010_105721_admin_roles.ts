import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// Back-office profiles (admins.role): full, crm (/crm only), technician (Support tickets only).
// Existing accounts keep everything ('full'); accounts created afterwards start as 'crm'
// (least privilege) until a full administrator chooses their profile.
// pages_copy is deliberately left unchanged (see 20261008_090825_crm).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_admins_role" AS ENUM('full', 'crm', 'technician');
  ALTER TABLE "admins" ADD COLUMN "role" "enum_admins_role" DEFAULT 'full' NOT NULL;
  ALTER TABLE "admins" ALTER COLUMN "role" SET DEFAULT 'crm';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" DROP COLUMN IF EXISTS "role";
  DROP TYPE IF EXISTS "public"."enum_admins_role";`)
}
