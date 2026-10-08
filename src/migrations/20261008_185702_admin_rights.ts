import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// Account administration separated from the mailbox rights (additive). Only the owner named
// in CLAUDE.md manages accounts; holding "send" gives no power over other accounts.
// pages_copy is deliberately left unchanged (see 20261008_090825_crm).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" ADD COLUMN "manage_admins" boolean DEFAULT false;
  UPDATE "admins" SET "manage_admins" = true WHERE lower("email") = 'ydiop@5sursync.com';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" DROP COLUMN IF EXISTS "manage_admins";`)
}
