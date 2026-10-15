import fs from "node:fs"; import path from "node:path";
for (const raw of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) { const l = raw.trim(); if (!l || l.startsWith("#")) continue; const i = l.indexOf("="); if (i > 0 && process.env[l.slice(0, i)] === undefined) process.env[l.slice(0, i)] = l.slice(i + 1); }
(async () => {
  const { db } = await import("../lib/db"); const { askAssistant } = await import("../lib/assistant");
  const acc = db.prepare("SELECT id FROM accounts WHERE name = ?").get("Brisbane Demo Fleet") as { id: string };
  const q = process.argv.slice(2).join(" ") || "What should I click first?";
  const r = await askAssistant({ accountId: acc.id, question: q, page: "/dashboard" });
  console.log(r.answer); console.log(`\n[cost US$${r.costUsd.toFixed(4)} mock=${r.mock}]`);
})();
