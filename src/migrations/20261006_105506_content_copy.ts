import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_texts" RENAME TO "pages_copy";
  ALTER TABLE "pages_copy" DROP CONSTRAINT "pages_texts_parent_id_fk";
  
  DROP INDEX "pages_texts_order_idx";
  DROP INDEX "pages_texts_parent_id_idx";
  ALTER TABLE "pages_copy" ADD CONSTRAINT "pages_copy_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_copy_order_idx" ON "pages_copy" USING btree ("_order");
  CREATE INDEX "pages_copy_parent_id_idx" ON "pages_copy" USING btree ("_parent_id");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_copy" RENAME TO "pages_texts";
  ALTER TABLE "pages_texts" DROP CONSTRAINT "pages_copy_parent_id_fk";
  
  DROP INDEX "pages_copy_order_idx";
  DROP INDEX "pages_copy_parent_id_idx";
  ALTER TABLE "pages_texts" ADD CONSTRAINT "pages_texts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_texts_order_idx" ON "pages_texts" USING btree ("_order");
  CREATE INDEX "pages_texts_parent_id_idx" ON "pages_texts" USING btree ("_parent_id");`);
}
