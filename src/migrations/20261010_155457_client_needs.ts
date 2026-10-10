import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// Audit des six améliorations, 10 octobre 2026. Générée par `payload migrate:create`
// contre une copie jetable de la base de production, donc l'écart est exact. Couvre :
//  - clients_needs + clients.needs_detail : besoins et services demandés d'une entreprise
//    (point 3 de l'audit), même vocabulaire que le formulaire public et les tickets ;
//  - tickets.priority : priorité de tri, fixée par l'équipe, défaut « normale » ;
//  - contact_requests.service : page de service consultée avant l'envoi du formulaire ;
//  - pages_copy.value : la contrainte NOT NULL est levée, car une mission par pays peut
//    légitimement rester vide (le code l'autorise déjà, la base le refusait encore).
// Tout est additif ; aucune donnée existante n'est modifiée.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tickets_priority" AS ENUM('urgent', 'high', 'normal', 'low');
  CREATE TYPE "public"."enum_clients_needs" AS ENUM('reseaux-cloud', 'solutions-metier', 'developpement-api', 'maintenance-support', 'autre');
  CREATE TABLE "clients_needs" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_clients_needs",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "pages_copy" ALTER COLUMN "value" DROP NOT NULL;
  ALTER TABLE "contact_requests" ADD COLUMN "service" varchar;
  ALTER TABLE "tickets" ADD COLUMN "priority" "enum_tickets_priority" DEFAULT 'normal' NOT NULL;
  ALTER TABLE "clients" ADD COLUMN "needs_detail" varchar;
  ALTER TABLE "clients_needs" ADD CONSTRAINT "clients_needs_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "clients_needs_order_idx" ON "clients_needs" USING btree ("order");
  CREATE INDEX "clients_needs_parent_idx" ON "clients_needs" USING btree ("parent_id");
  CREATE INDEX "clients_needs_value_idx" ON "clients_needs" USING btree ("value");
  CREATE INDEX "tickets_priority_idx" ON "tickets" USING btree ("priority");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients_needs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "clients_needs" CASCADE;
  DROP INDEX "tickets_priority_idx";
  ALTER TABLE "pages_copy" ALTER COLUMN "value" SET NOT NULL;
  ALTER TABLE "contact_requests" DROP COLUMN "service";
  ALTER TABLE "tickets" DROP COLUMN "priority";
  ALTER TABLE "clients" DROP COLUMN "needs_detail";
  DROP TYPE "public"."enum_tickets_priority";
  DROP TYPE "public"."enum_clients_needs";`)
}
