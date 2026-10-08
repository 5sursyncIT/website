import { Pool } from "pg";
import { requiredSecret } from "./env";
let pool: Pool | undefined;
export function database() {
  return (pool ??= new Pool({
    connectionString: requiredSecret("DATABASE_URI"),
    max: 3,
  }));
}
