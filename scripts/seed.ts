/**
 * Seed the Brisbane demo fleet from the CLI.
 *
 *   npx tsx scripts/seed.ts [--force] [--warm]
 *
 * --force  reseed even if the account already has trucks
 * --warm   call HERE for each load lacking a route (needs HERE_API_KEY)
 */
import fs from "node:fs";
import path from "node:path";

// Tiny .env.local loader: sets only keys not already in the environment.
function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has("--force");
  const warm = args.has("--warm");

  // Import after env is loaded so DB_PATH is honoured.
  const { db } = await import("../lib/db");
  await import("../lib/domain/schema");
  const { seedBrisbaneFleet, warmRoutes } = await import("../lib/seed-brisbane");

  const account = db.prepare("SELECT id, name FROM accounts WHERE name = ?").get("Brisbane Demo Fleet") as
    | { id: string; name: string } | undefined;
  if (!account) {
    console.error('Account "Brisbane Demo Fleet" not found; lib/db.ts seeds it on first boot.');
    process.exit(1);
  }

  const counts = seedBrisbaneFleet(account.id, { force });
  console.log(`Seeded ${account.name} (${account.id})${force ? " [force]" : ""}:`);
  console.log(JSON.stringify(counts, null, 2));

  if (warm) {
    if (!process.env.HERE_API_KEY) {
      console.error("HERE_API_KEY not set; skipping --warm.");
    } else {
      const res = await warmRoutes(account.id);
      console.log(`Routes warmed: ${res.routed} routed, ${res.failed} failed`);
      for (const e of res.errors) console.log(`  ${e.ref}: ${e.error}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
