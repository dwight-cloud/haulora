import type { TruckRouteOption } from "./here";

export interface RiskBreakdown {
  score: number;
  level: "low" | "moderate" | "elevated" | "high";
  factors: Array<{ label: string; weight: number }>;
}

export function computeRisk(route: TruckRouteOption): RiskBreakdown {
  const factors: Array<{ label: string; weight: number }> = [];
  let score = 10;

  const hours = route.durationSeconds / 3600;
  if (hours > 8) { score += 15; factors.push({ label: `Long haul (${hours.toFixed(1)}h)`, weight: 15 }); }
  else if (hours > 4) { score += 8; factors.push({ label: `Medium haul (${hours.toFixed(1)}h)`, weight: 8 }); }

  const severityWeight: Record<string, number> = { info: 2, warning: 10, critical: 25 };
  for (const n of route.notices) {
    const w = severityWeight[n.severity] ?? 5;
    score += w;
    factors.push({ label: n.title, weight: w });
  }

  if (route.tolls?.total && route.tolls.total > 50) {
    factors.push({ label: `High toll route (${route.tolls.total.toFixed(0)} ${route.tolls.currency ?? ""})`, weight: 3 });
    score += 3;
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  const level: RiskBreakdown["level"] =
    score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "elevated" : "high";
  return { score, level, factors };
}
