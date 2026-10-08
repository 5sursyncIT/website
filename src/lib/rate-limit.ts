import { Pool } from "pg";
import { createHash } from "node:crypto";
import { requiredSecret } from "./env";
import { HTTPError } from "./backend";
let pool: Pool | undefined;
export async function rateLimit(
  request: Request,
  scope: string,
  limit: number,
  seconds = 900,
) {
  pool ??= new Pool({
    connectionString: requiredSecret("DATABASE_URI"),
    max: 3,
  });
  const ip = request.headers.get("x-real-ip") || "local";
  const window = Math.floor(Date.now() / 1000 / seconds);
  const key = createHash("sha256")
    .update(`${scope}:${ip}:${window}`)
    .digest("hex");
  const expires = new Date((window + 1) * seconds * 1000);
  const { rows } = await pool.query(
    "INSERT INTO app_rate_limits (key, count, expires_at) VALUES ($1,1,$2) ON CONFLICT (key) DO UPDATE SET count=app_rate_limits.count+1 RETURNING count",
    [key, expires],
  );
  if (rows[0].count > limit)
    throw new HTTPError(429, "Trop de demandes. Réessayez plus tard.");
  if (Math.random() < 0.01)
    await pool.query("DELETE FROM app_rate_limits WHERE expires_at<NOW()");
}
