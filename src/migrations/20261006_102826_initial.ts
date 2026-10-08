import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tickets_category" AS ENUM('reseaux-cloud', 'solutions-metier', 'developpement-api', 'maintenance-support', 'autre');
  CREATE TYPE "public"."enum_tickets_status" AS ENUM('open', 'in-progress', 'waiting-client', 'resolved', 'closed');
  CREATE TYPE "public"."enum_contact_requests_notification" AS ENUM('not-configured', 'pending', 'sent', 'failed');
  CREATE TABLE "admins_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "admins" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "client_accounts_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "client_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"client_id" integer NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"invited_at" timestamp(3) with time zone,
  	"invitation_hash" varchar,
  	"invitation_expires_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "tickets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"subject" varchar NOT NULL,
  	"category" "enum_tickets_category" NOT NULL,
  	"description" varchar NOT NULL,
  	"status" "enum_tickets_status" DEFAULT 'open' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tickets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"client_accounts_id" integer
  );
  
  CREATE TABLE "ticket_replies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"ticket_id" integer NOT NULL,
  	"message" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ticket_replies_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"client_accounts_id" integer
  );
  
  CREATE TABLE "ticket_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ticket_id" integer NOT NULL,
  	"note" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ticket_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"ticket_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"mime" varchar NOT NULL,
  	"bytes" numeric NOT NULL,
  	"storage_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages_texts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "contact_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"company" varchar,
  	"email" varchar NOT NULL,
  	"phone" varchar,
  	"topic" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"notification" "enum_contact_requests_notification" DEFAULT 'not-configured',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"clients_id" integer,
  	"client_accounts_id" integer,
  	"tickets_id" integer,
  	"ticket_replies_id" integer,
  	"ticket_notes_id" integer,
  	"ticket_files_id" integer,
  	"pages_id" integer,
  	"media_id" integer,
  	"contact_requests_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"client_accounts_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "admins_sessions" ADD CONSTRAINT "admins_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "client_accounts_sessions" ADD CONSTRAINT "client_accounts_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tickets_rels" ADD CONSTRAINT "tickets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tickets_rels" ADD CONSTRAINT "tickets_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tickets_rels" ADD CONSTRAINT "tickets_rels_client_accounts_fk" FOREIGN KEY ("client_accounts_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ticket_replies_rels" ADD CONSTRAINT "ticket_replies_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ticket_replies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ticket_replies_rels" ADD CONSTRAINT "ticket_replies_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ticket_replies_rels" ADD CONSTRAINT "ticket_replies_rels_client_accounts_fk" FOREIGN KEY ("client_accounts_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ticket_files" ADD CONSTRAINT "ticket_files_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ticket_files" ADD CONSTRAINT "ticket_files_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_texts" ADD CONSTRAINT "pages_texts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clients_fk" FOREIGN KEY ("clients_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_accounts_fk" FOREIGN KEY ("client_accounts_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tickets_fk" FOREIGN KEY ("tickets_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ticket_replies_fk" FOREIGN KEY ("ticket_replies_id") REFERENCES "public"."ticket_replies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ticket_notes_fk" FOREIGN KEY ("ticket_notes_id") REFERENCES "public"."ticket_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ticket_files_fk" FOREIGN KEY ("ticket_files_id") REFERENCES "public"."ticket_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_requests_fk" FOREIGN KEY ("contact_requests_id") REFERENCES "public"."contact_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_client_accounts_fk" FOREIGN KEY ("client_accounts_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "admins_sessions_order_idx" ON "admins_sessions" USING btree ("_order");
  CREATE INDEX "admins_sessions_parent_id_idx" ON "admins_sessions" USING btree ("_parent_id");
  CREATE INDEX "admins_updated_at_idx" ON "admins" USING btree ("updated_at");
  CREATE INDEX "admins_created_at_idx" ON "admins" USING btree ("created_at");
  CREATE UNIQUE INDEX "admins_email_idx" ON "admins" USING btree ("email");
  CREATE INDEX "clients_updated_at_idx" ON "clients" USING btree ("updated_at");
  CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");
  CREATE INDEX "client_accounts_sessions_order_idx" ON "client_accounts_sessions" USING btree ("_order");
  CREATE INDEX "client_accounts_sessions_parent_id_idx" ON "client_accounts_sessions" USING btree ("_parent_id");
  CREATE INDEX "client_accounts_client_idx" ON "client_accounts" USING btree ("client_id");
  CREATE INDEX "client_accounts_invitation_hash_idx" ON "client_accounts" USING btree ("invitation_hash");
  CREATE INDEX "client_accounts_updated_at_idx" ON "client_accounts" USING btree ("updated_at");
  CREATE INDEX "client_accounts_created_at_idx" ON "client_accounts" USING btree ("created_at");
  CREATE UNIQUE INDEX "client_accounts_email_idx" ON "client_accounts" USING btree ("email");
  CREATE INDEX "tickets_client_idx" ON "tickets" USING btree ("client_id");
  CREATE INDEX "tickets_updated_at_idx" ON "tickets" USING btree ("updated_at");
  CREATE INDEX "tickets_created_at_idx" ON "tickets" USING btree ("created_at");
  CREATE INDEX "tickets_rels_order_idx" ON "tickets_rels" USING btree ("order");
  CREATE INDEX "tickets_rels_parent_idx" ON "tickets_rels" USING btree ("parent_id");
  CREATE INDEX "tickets_rels_path_idx" ON "tickets_rels" USING btree ("path");
  CREATE INDEX "tickets_rels_admins_id_idx" ON "tickets_rels" USING btree ("admins_id");
  CREATE INDEX "tickets_rels_client_accounts_id_idx" ON "tickets_rels" USING btree ("client_accounts_id");
  CREATE INDEX "ticket_replies_client_idx" ON "ticket_replies" USING btree ("client_id");
  CREATE INDEX "ticket_replies_ticket_idx" ON "ticket_replies" USING btree ("ticket_id");
  CREATE INDEX "ticket_replies_updated_at_idx" ON "ticket_replies" USING btree ("updated_at");
  CREATE INDEX "ticket_replies_created_at_idx" ON "ticket_replies" USING btree ("created_at");
  CREATE INDEX "ticket_replies_rels_order_idx" ON "ticket_replies_rels" USING btree ("order");
  CREATE INDEX "ticket_replies_rels_parent_idx" ON "ticket_replies_rels" USING btree ("parent_id");
  CREATE INDEX "ticket_replies_rels_path_idx" ON "ticket_replies_rels" USING btree ("path");
  CREATE INDEX "ticket_replies_rels_admins_id_idx" ON "ticket_replies_rels" USING btree ("admins_id");
  CREATE INDEX "ticket_replies_rels_client_accounts_id_idx" ON "ticket_replies_rels" USING btree ("client_accounts_id");
  CREATE INDEX "ticket_notes_ticket_idx" ON "ticket_notes" USING btree ("ticket_id");
  CREATE INDEX "ticket_notes_updated_at_idx" ON "ticket_notes" USING btree ("updated_at");
  CREATE INDEX "ticket_notes_created_at_idx" ON "ticket_notes" USING btree ("created_at");
  CREATE INDEX "ticket_files_client_idx" ON "ticket_files" USING btree ("client_id");
  CREATE INDEX "ticket_files_ticket_idx" ON "ticket_files" USING btree ("ticket_id");
  CREATE INDEX "ticket_files_updated_at_idx" ON "ticket_files" USING btree ("updated_at");
  CREATE INDEX "ticket_files_created_at_idx" ON "ticket_files" USING btree ("created_at");
  CREATE INDEX "pages_texts_order_idx" ON "pages_texts" USING btree ("_order");
  CREATE INDEX "pages_texts_parent_id_idx" ON "pages_texts" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "contact_requests_updated_at_idx" ON "contact_requests" USING btree ("updated_at");
  CREATE INDEX "contact_requests_created_at_idx" ON "contact_requests" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_admins_id_idx" ON "payload_locked_documents_rels" USING btree ("admins_id");
  CREATE INDEX "payload_locked_documents_rels_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("clients_id");
  CREATE INDEX "payload_locked_documents_rels_client_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("client_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_tickets_id_idx" ON "payload_locked_documents_rels" USING btree ("tickets_id");
  CREATE INDEX "payload_locked_documents_rels_ticket_replies_id_idx" ON "payload_locked_documents_rels" USING btree ("ticket_replies_id");
  CREATE INDEX "payload_locked_documents_rels_ticket_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("ticket_notes_id");
  CREATE INDEX "payload_locked_documents_rels_ticket_files_id_idx" ON "payload_locked_documents_rels" USING btree ("ticket_files_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_contact_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_requests_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_admins_id_idx" ON "payload_preferences_rels" USING btree ("admins_id");
  CREATE INDEX "payload_preferences_rels_client_accounts_id_idx" ON "payload_preferences_rels" USING btree ("client_accounts_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "admins_sessions" CASCADE;
  DROP TABLE "admins" CASCADE;
  DROP TABLE "clients" CASCADE;
  DROP TABLE "client_accounts_sessions" CASCADE;
  DROP TABLE "client_accounts" CASCADE;
  DROP TABLE "tickets" CASCADE;
  DROP TABLE "tickets_rels" CASCADE;
  DROP TABLE "ticket_replies" CASCADE;
  DROP TABLE "ticket_replies_rels" CASCADE;
  DROP TABLE "ticket_notes" CASCADE;
  DROP TABLE "ticket_files" CASCADE;
  DROP TABLE "pages_texts" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "contact_requests" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_tickets_category";
  DROP TYPE "public"."enum_tickets_status";
  DROP TYPE "public"."enum_contact_requests_notification";`);
}
