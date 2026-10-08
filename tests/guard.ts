// Fixture tests create a known-password admin: refuse anything but a *_test database.
import { secret } from "../src/lib/env";
const database = new URL(secret("DATABASE_URI") || "postgres://x/none").pathname.slice(1);
if (!/_test$/.test(database)) {
  console.error("Refus : ces tests exigent une base dont le nom finit par _test.");
  process.exit(2);
}
