/**
 * Drover domain schema.
 *
 * Everything the three agents read and write lives here. Units are metric and
 * currency is AUD unless a column says otherwise. All tables are tenant-scoped
 * by account_id so the demo can host several fleets without leaking data.
 */
import { db } from "../db";

db.exec(`
  -- Trucks in the operator's fleet. Profile fields feed HERE truck routing.
  CREATE TABLE IF NOT EXISTS trucks (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,              -- "BNE-01"
    rego            TEXT,                       -- Queensland plate
    driver_name     TEXT,
    status          TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('moving','idle','off_duty','out_of_service')),
    lat             REAL NOT NULL,
    lon             REAL NOT NULL,
    height_m        REAL NOT NULL DEFAULT 4.3,
    gross_kg        INTEGER NOT NULL DEFAULT 42500,
    axle_count      INTEGER NOT NULL DEFAULT 6,
    hazardous       INTEGER NOT NULL DEFAULT 0,
    tank_litres     INTEGER NOT NULL DEFAULT 800,
    fuel_pct        REAL NOT NULL DEFAULT 70,
    litres_per_100km REAL NOT NULL DEFAULT 48,  -- B-double laden, typical
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_trucks_account ON trucks(account_id);

  -- Customers and their freight contract terms. The fuel levy clause is what
  -- the fuel agent recomputes when diesel moves.
  CREATE TABLE IF NOT EXISTS customers (
    id                 TEXT PRIMARY KEY,
    account_id         TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    contact_email      TEXT,
    base_rate_per_km   REAL NOT NULL,           -- AUD per loaded km, ex-levy
    levy_method        TEXT NOT NULL DEFAULT 'indexed'
                       CHECK (levy_method IN ('indexed','fixed','none')),
    levy_base_cpl      REAL,                    -- diesel c/L the base rate assumes
    levy_fuel_share    REAL NOT NULL DEFAULT 0.30, -- share of cost base that is fuel
    levy_current_pct   REAL NOT NULL DEFAULT 0,  -- levy currently applied (%)
    levy_notice_days   INTEGER NOT NULL DEFAULT 7,
    weekly_km          REAL NOT NULL DEFAULT 0,  -- typical loaded km per week
    created_at         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_customers_account ON customers(account_id);

  -- Loads: one consignment moving from A to B on a truck. Planned vs current
  -- route lets the disruption agent show what changed and why.
  CREATE TABLE IF NOT EXISTS loads (
    id               TEXT PRIMARY KEY,
    account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    customer_id      TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    truck_id         TEXT REFERENCES trucks(id) ON DELETE SET NULL,
    ref              TEXT NOT NULL,             -- "LM-1042"
    description      TEXT NOT NULL,
    origin_label     TEXT NOT NULL,
    origin_lat       REAL NOT NULL,
    origin_lon       REAL NOT NULL,
    dest_label       TEXT NOT NULL,
    dest_lat         REAL NOT NULL,
    dest_lon         REAL NOT NULL,
    pickup_at        INTEGER NOT NULL,
    due_at           INTEGER NOT NULL,
    tonnes           REAL NOT NULL DEFAULT 20,
    value_aud        REAL NOT NULL DEFAULT 0,   -- cargo value, for stranded-value maths
    perishable       INTEGER NOT NULL DEFAULT 0,
    essential        INTEGER NOT NULL DEFAULT 0, -- food/medical to a cut-off town
    status           TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','en_route','delayed','rerouted','held','delivered','cancelled')),
    planned_polyline TEXT,
    planned_km       REAL,
    planned_hours    REAL,
    current_polyline TEXT,
    current_km       REAL,
    current_hours    REAL,
    replan_reason    TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_loads_account ON loads(account_id, status);

  -- Diesel price observations. One row per capture; the latest per region wins.
  CREATE TABLE IF NOT EXISTS fuel_prices (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    captured_at INTEGER NOT NULL,
    region      TEXT NOT NULL,                  -- "QLD", "Brisbane", "Townsville"
    diesel_cpl  REAL NOT NULL,                  -- cents per litre, retail TGP-like
    source      TEXT NOT NULL                   -- "seed", "scenario", "accc", "feed"
  );
  CREATE INDEX IF NOT EXISTS idx_fuel_account_time ON fuel_prices(account_id, captured_at);

  -- Road and weather disruptions that can affect a route.
  CREATE TABLE IF NOT EXISTS road_events (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    source      TEXT NOT NULL,                  -- "seed", "scenario", "qldtraffic", "bom", "open-meteo"
    kind        TEXT NOT NULL
                CHECK (kind IN ('closure','flood','fire','crash','restriction','weather')),
    road        TEXT,
    title       TEXT NOT NULL,
    description TEXT,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    radius_km   REAL NOT NULL DEFAULT 5,
    severity    TEXT NOT NULL DEFAULT 'major'
                CHECK (severity IN ('minor','moderate','major','critical')),
    starts_at   INTEGER NOT NULL,
    ends_at     INTEGER,                        -- null = unknown
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_road_events_active ON road_events(account_id, active);

  -- One row per agent invocation. Token and cost columns are filled as the
  -- run proceeds so the dashboard cost meter is always current.
  CREATE TABLE IF NOT EXISTS agent_runs (
    id            TEXT PRIMARY KEY,
    account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    agent         TEXT NOT NULL CHECK (agent IN ('fuel','disruption','capacity')),
    trigger       TEXT NOT NULL,                -- what woke the agent
    status        TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed','budget_exceeded')),
    model         TEXT NOT NULL,
    mock          INTEGER NOT NULL DEFAULT 0,   -- 1 when no API key was present
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL NOT NULL DEFAULT 0,
    tool_calls    INTEGER NOT NULL DEFAULT 0,
    summary       TEXT,
    error         TEXT,
    started_at    INTEGER NOT NULL,
    finished_at   INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_runs_account ON agent_runs(account_id, started_at);

  -- The visible trace: every thought, tool call, result, guardrail and proposal.
  CREATE TABLE IF NOT EXISTS agent_steps (
    id         TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    kind       TEXT NOT NULL
               CHECK (kind IN ('system','thought','tool_call','tool_result','guardrail','proposal','final','error')),
    name       TEXT,
    payload    TEXT NOT NULL,                   -- JSON
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_steps_run ON agent_steps(run_id, seq);

  -- Proposed actions awaiting a human, or auto-executed when low risk.
  CREATE TABLE IF NOT EXISTS actions (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    run_id      TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    agent       TEXT NOT NULL,
    kind        TEXT NOT NULL,                  -- "rate_card_update", "customer_notice", "replan_load", "hold_load"
    title       TEXT NOT NULL,
    description TEXT,
    payload     TEXT NOT NULL,                  -- JSON the executor needs
    impact_aud  REAL NOT NULL DEFAULT 0,        -- positive = money recovered/saved
    risk        TEXT NOT NULL DEFAULT 'medium' CHECK (risk IN ('low','medium','high')),
    status      TEXT NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed','approved','rejected','executed','auto_executed','failed')),
    created_at  INTEGER NOT NULL,
    decided_at  INTEGER,
    decided_by  TEXT,
    result      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_actions_account ON actions(account_id, status, created_at);

  -- Eval runs recorded by scripts/eval.ts so the UI can show the latest score.
  CREATE TABLE IF NOT EXISTS eval_runs (
    id          TEXT PRIMARY KEY,
    suite       TEXT NOT NULL,                  -- "fuel_levy", "disruption_triage"
    model       TEXT NOT NULL,
    total       INTEGER NOT NULL,
    passed      INTEGER NOT NULL,
    cost_usd    REAL NOT NULL DEFAULT 0,
    p95_ms      INTEGER,
    report      TEXT NOT NULL,                  -- JSON per-case results
    created_at  INTEGER NOT NULL
  );
`);

export function genId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
