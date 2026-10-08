import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_social_links_links_platform" AS ENUM('facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'whatsapp');
  CREATE TABLE "social_links_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_social_links_links_platform" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "social_links" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "social_links_links" ADD CONSTRAINT "social_links_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."social_links"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "social_links_links_order_idx" ON "social_links_links" USING btree ("_order");
  CREATE INDEX "social_links_links_parent_id_idx" ON "social_links_links" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "social_links_links" CASCADE;
  DROP TABLE "social_links" CASCADE;
  DROP TYPE "public"."enum_social_links_links_platform";`)
}
