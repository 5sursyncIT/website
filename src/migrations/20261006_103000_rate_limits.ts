import {
  type MigrateUpArgs,
  type MigrateDownArgs,
  sql,
} from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs) {
  await db.execute(
    sql`CREATE TABLE app_rate_limits (key varchar PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);CREATE INDEX app_rate_limits_expiry ON app_rate_limits(expires_at);`,
  );
}
export async function down({ db }: MigrateDownArgs) {
  await db.execute(sql`DROP TABLE app_rate_limits;`);
}
