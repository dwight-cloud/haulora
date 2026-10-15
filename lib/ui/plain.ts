/**
 * Plain-language glossary for every user-facing screen.
 *
 * The product is used by people who run a handful of trucks and have never
 * seen an AI product. Industry and AI words ("fuel levy", "guardrail",
 * "tokens") are replaced with the words a helpful colleague would use, and
 * the one-line `explain` is shown on hover / focus by <Term>.
 *
 * Keep technical words (model id, token counts, raw JSON) on /evals, /about,
 * /agents and behind "Details for engineers" only.
 */

export interface PlainTerm { plain: string; explain: string }

export const GLOSSARY = {
  // Money
  "fuel levy":         { plain: "fuel surcharge",         explain: "The extra percentage added to a customer's bill when diesel goes up, as their contract allows." },
  "rate card":         { plain: "the customer's prices",  explain: "What you charge that customer per kilometre." },
  "levy drift":        { plain: "surcharge out of date",  explain: "You are charging less for fuel than diesel is costing you right now." },
  "under-recovered":   { plain: "surcharge out of date",  explain: "You are charging less for fuel than diesel is costing you right now." },
  "c/L":               { plain: "cents a litre",          explain: "The price of diesel, in cents per litre." },

  // Loads and their status
  "load":              { plain: "delivery job",           explain: "One pickup and delivery for a customer." },
  "consignment":       { plain: "delivery job",           explain: "One pickup and delivery for a customer." },
  "en route":          { plain: "on the road",            explain: "The truck has picked up and is driving to the delivery." },
  "planned":           { plain: "booked",                 explain: "The job is booked but the truck has not picked up yet." },
  "rerouted":          { plain: "new route",              explain: "The truck is taking a different road to get around a problem." },
  "held":              { plain: "waiting at the depot",   explain: "The truck is staying put until the road is safe." },
  "delayed":           { plain: "running late",           explain: "The job will arrive after the time the customer was promised." },
  "delivered":         { plain: "delivered",              explain: "The job is finished." },

  // What the AI helper can suggest
  "reroute":           { plain: "new route around the problem",        explain: "Send the truck a different way so it avoids the closure." },
  "detour":            { plain: "new route around the problem",        explain: "Send the truck a different way so it avoids the closure." },
  "hold":              { plain: "keep the truck at the depot for now",  explain: "Do not send the truck until the road is safe again." },
  "escalate":          { plain: "needs your call",        explain: "The AI could not decide safely, so it is asking you." },
  "proposal":          { plain: "suggestion",             explain: "Something the AI helper thinks you should do. Nothing happens until you accept it." },
  "approve":           { plain: "accept",                 explain: "Go ahead with the suggestion." },
  "reject":            { plain: "decline",                explain: "Throw the suggestion away." },

  // Roads and freight
  "disruption":        { plain: "road problem",           explain: "Closures, floods, fires and bad weather on the roads your trucks use." },
  "disruptions":       { plain: "road problems",          explain: "Closures, floods, fires and bad weather on the roads your trucks use." },
  "essential":         { plain: "urgent goods",           explain: "Food, medicine or supplies a town is waiting on." },
  "perishable":        { plain: "goods that spoil",       explain: "Fresh produce, chilled or frozen goods that cannot wait." },

  // AI words
  "agent":             { plain: "AI helper",              explain: "A piece of software that reads your fleet's data, works something out and suggests what to do. It never changes anything itself." },
  "run":               { plain: "check",                  explain: "One time the AI helper looked at your fleet and worked out what to suggest." },
  "trace":             { plain: "what the AI helper did", explain: "The full list of everything the AI helper read and worked out, in order." },
  "tool call":         { plain: "step",                   explain: "One thing the AI helper looked up or worked out." },
  "guardrail":         { plain: "safety stop",            explain: "A hard limit built into the software that stops the AI helper going further." },
  "evals":             { plain: "accuracy tests",         explain: "Fixed test questions we run to check the AI helper gets the right answer." },
  "cost per run":      { plain: "what each check costs",  explain: "What we pay the AI company each time a helper looks at your fleet." },
  "model":             { plain: "the AI",                 explain: "The language model the helpers use to reason, from an AI company." },

  // Drivers, trucks, services
  "capacity":          { plain: "driver cover",           explain: "Whether you have a driver and truck free to take a job." },
  "fatigue rules":     { plain: "driving-hours rules",    explain: "The legal limits on how long a driver can work before resting." },
  "telematics":        { plain: "truck tracking",         explain: "The gear in each truck that reports where it is." },
  "HERE":              { plain: "the routing service",    explain: "The map service that works out truck-legal routes." },
} as const satisfies Record<string, PlainTerm>;

export type GlossaryTerm = keyof typeof GLOSSARY;

/** The plain word for a term. Unknown terms are returned unchanged. */
export function plain(term: GlossaryTerm | string): string {
  return (GLOSSARY as Record<string, PlainTerm>)[term]?.plain ?? term;
}

/** The one-line explanation for a term, or an empty string. */
export function explain(term: GlossaryTerm | string): string {
  return (GLOSSARY as Record<string, PlainTerm>)[term]?.explain ?? "";
}

/** Plain names for the three AI helpers. */
export const AGENT_PLAIN: Record<string, string> = {
  fuel: "fuel AI helper",
  disruption: "road AI helper",
  capacity: "driver-cover AI helper",
};
export function agentName(agent: string, capital = false): string {
  const n = AGENT_PLAIN[agent] ?? `${agent} AI helper`;
  return capital ? n.charAt(0).toUpperCase() + n.slice(1) : n;
}

/** Plain name for each kind of suggestion the AI helpers can make. */
export const ACTION_KIND_PLAIN: Record<string, string> = {
  rate_card_update: "Fuel surcharge change",
  replan_load: "New route",
  hold_load: "Keep at depot",
  flag_for_review: "Needs your call",
  customer_notice: "Customer notice",
  reassign_load: "Different truck",
};

/** Plain words for a suggestion's status. */
export const ACTION_STATUS_PLAIN: Record<string, string> = {
  proposed: "waiting for you",
  approved: "accepted",
  executed: "accepted",
  auto_executed: "sent automatically",
  rejected: "declined",
  failed: "did not go through",
};

/** Plain words for an AI helper check's status. */
export const RUN_STATUS_PLAIN: Record<string, string> = {
  completed: "finished",
  running: "working",
  failed: "did not finish",
  budget_exceeded: "stopped by a safety stop",
};
export function runStatus(s: string): string {
  return RUN_STATUS_PLAIN[s] ?? s.replace(/_/g, " ");
}

/**
 * Rewrites industry words inside strings that come from the data layer
 * (suggestion titles, trigger text, notice subjects) so the screen reads in
 * plain words without touching the stored text or the API.
 */
const REWRITES: Array<[RegExp, string]> = [
  [/\bfuel levy\b/gi, "fuel surcharge"],
  [/\blevy\b/gi, "fuel surcharge"],
  [/\blevies\b/gi, "fuel surcharges"],
  [/\brate[- ]card\b/gi, "prices"],
  [/\bre-?route around disruption\b/gi, "new route around the road problem"],
  [/\bre-?route\b/gi, "new route"],
  [/\bdisruption\b/gi, "road problem"],
  [/\bconsignment\b/gi, "delivery job"],
  [/\bhold at\b/gi, "wait at"],
  [/\breassign to\b/gi, "move to"],
  [/\bno legal cover today\b/gi, "nobody can legally take it today"],
  [/\bneeds a human decision\b/gi, "needs your call"],
  [/\bneeds a human\b/gi, "needs your call"],
  [/\bUncovered load\b/g, "Delivery job with no driver"],
  [/\bscenario:\w+\s*\((.*)\)$/, "$1"],
];
export function plainText(s: string | null | undefined): string {
  if (!s) return "";
  let out = s;
  for (const [re, to] of REWRITES) out = out.replace(re, to);
  return out;
}
