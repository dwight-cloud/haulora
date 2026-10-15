# Haulora

Fleet management for small and mid-size Australian road freight operators, with three AI agents inside it and a helper you can chat to. The agents watch the three things squeezing a 5 to 50 truck fleet in 2026: diesel, road disruption, and driver capacity. Each one reads live and seeded data, decides with a deterministic engine, and **proposes**. A dispatcher approves. Low-risk housekeeping (customer notices, review flags) executes on its own.

This is a proof of concept built for a case study. It is honest about what is live and what is seeded (see *Data sources*).

## What it does

Two faces on one system: the office (Overview, Trucks, Delivery jobs, Customers, Road problems, Your decisions) and a driver phone app at `/driver` (today's jobs, start and deliver, share location, report a road problem, which wakes the disruption agent). `/driver-preview` shows the driver app inside a phone frame for reviewers on a laptop.

Pages a dispatcher already understands: Overview, Fleet, Loads, Customers, Disruptions, Decisions. The AI agents live inside them. A read-only helper ("Ask Haulora", bottom right) explains the system, says what to click, and describes what is happening in the fleet right now; it can never change anything and runs under the same cost caps as the agents.

| Agent | Trigger | Decides | Proposes | Metric |
|---|---|---|---|---|
| **Fuel** | diesel price observation | what each customer's indexed fuel levy should be at today's price | rate-card updates with the customer notice drafted; review flags for stale fixed levies | A$ recovered per week |
| **Disruption** | road or weather event | per affected load: reroute, hold, proceed, or escalate | truck-legal detours (HERE), holds, escalations, customer notices | cargo value protected, hours saved |
| **Capacity** (Phase 2, rules-only here) | driver or truck unavailable | which idle truck can legally cover each uncovered load | reassignments; escalations when nothing legal exists today | loads covered per driver-day |

Decision rules are written down in the agent files and encoded in a 100-case golden set (`evals/`). The eval runner scores the deterministic engine and, separately, the model answering alone. The point of the design is the gap between those two numbers.

## Architecture

```
Dispatcher UI (Next.js)
   │  scenario buttons · approvals · trace viewer · evals · cost meter
   ▼
API routes (/api/scenarios, /api/agents/run, /api/actions, …)
   │
   ▼
Agent runtime (lib/agents/runtime.ts)        Claude Opus 5.5 via the Anthropic SDK, tool use (lib/llm.ts adapter)
   │  step cap · per-run cost cap · 24h spend cap · argument validation · trace
   ├── tools rated "read" ──► SQLite domain · HERE Routing v8 · Open-Meteo · QLDTraffic · BoM
   └── tools rated "propose" ──► actions table ──► approval queue ──► executor (deterministic)
```

Agents have no "execute" tools. The executor is the only code that changes a rate card, a route, or a load status, and it runs the same code whether a human clicked approve or the low-risk policy fired.

## Run it locally

```bash
npm install
cp .env.example .env.local        # fill in ANTHROPIC_API_KEY (+ ANTHROPIC_WORKSPACE_ID for user-scoped keys) and HERE_API_KEY
npm run seed:warm                 # seeds the Brisbane fleet, then fetches real HERE truck routes for 20 loads
npm run dev                       # http://localhost:3000 → "Open the live demo"
```

Without an `ANTHROPIC_API_KEY` the agents run in mock mode: the same tools and data, a scripted plan instead of the model, so the UI and evals still work.

Useful scripts:

```bash
npm test               # unit tests: levy engine, polyline geometry, event storage
npm run eval           # 100 golden cases against the deterministic engine
npm run eval:live      # the same cases, also answered by the model alone (costs about US$0.01)
npm run agent fuel     # run one agent from the CLI and print its trace
npm run agent scenario:bruce_cut
```

## Deploy

Single Docker host, Caddy with automatic HTTPS for the host named in the Caddyfile, SQLite bind-mounted at `./data`.

```bash
./deploy.sh user@host /opt/haulora --with-data   # first time: ships routes, evals, history
./deploy.sh user@host /opt/haulora               # code-only redeploy
```

## Data sources

| Source | Status in this POC |
|---|---|
| HERE Routing v8 (truck profile, avoid areas), Matrix, Tour Planning, Search | **live** |
| Open-Meteo forecast along a route | **live** |
| QLDTraffic events API | adapter built, public demo key; not synced automatically |
| Bureau of Meteorology warnings RSS | adapter built |
| Diesel prices | seeded from 2026 ACCC-referenced points (176.6 c/L pre-February, 281.0 c/L on 7 October); scenarios add shocks |
| Fleet, customers, loads, contracts | seeded Brisbane fleet of 8 trucks, 6 customers, 20 loads on real Queensland corridors |
| Road closures | two seeded baseline events; the flood scenario adds a critical closure at Ingham |

## Governance and cost

- Model pinned by ID in `lib/llm.ts` (`ANTHROPIC_MODEL` to override; `LLM_PROVIDER=openai` switches provider). Pricing table in the same file; override with `LLM_PRICE_IN` / `LLM_PRICE_OUT`.
- Caps: `AGENT_MAX_STEPS`, `AGENT_MAX_RUN_COST_USD`, `AGENT_DAILY_SPEND_CAP_USD`. Scenario and run endpoints are rate limited per visitor.
- Observed on Claude Opus 5.5: a fuel check costs about US$0.12 and takes 25 s; a road-problem check with HERE detours about US$0.09 and 22 s.
- Every step of every run is stored (`agent_steps`) and shown in the trace viewer. Guardrail events (bad arguments, caps) are visible, not hidden.

## Limitations

- Prices and closures are seeded or simulated; the adapters for live feeds exist but a pilot would wire them to a schedule.
- No telematics: driver hours are derived from truck status. The capacity agent therefore runs rules only and is labelled as a Phase 2 design.
- SQLite on one box. Fine for a demo and a first pilot fleet; the data layer is behind `lib/domain/repo.ts` so a move to Postgres is contained.
- Customer notices are recorded, not sent.

## Layout

```
app/            pages and API routes
components/     UI, map, trace viewer
lib/agents/     runtime, executor, fuel, disruption, capacity
lib/au/         fuel levy engine, prices, road events, weather, QLDTraffic
lib/domain/     schema, types, repository
lib/here.ts     HERE integration
evals/          golden sets and generators
scripts/        seed, eval, run-agent
```
