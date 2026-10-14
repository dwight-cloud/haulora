/**
 * FMCSA carrier lookup via the QCMobile JSON API.
 *   https://mobile.fmcsa.dot.gov/qc/services/carriers/<DOT>?webKey=...
 * A webKey is required (free registration at
 * https://mobile.fmcsa.dot.gov/QCDevsite). Set FMCSA_WEBKEY in the env.
 *
 * If no webKey is configured we fall back to the public Socrata census
 * (az4n-8mr2) so the page degrades gracefully.
 */

const QCMOBILE = "https://mobile.fmcsa.dot.gov/qc/services/carriers";
const CENSUS = "https://data.transportation.gov/resource/az4n-8mr2.json";
const UA = "OverdriveNav/0.1 (ops@overdrive.app)";

export interface SaferCarrier {
  dotNumber: number;
  legalName: string;
  dbaName?: string;
  status: string;                  // "Active" | "Inactive"
  allowedToOperate: boolean;
  entityType?: string;             // e.g. "Interstate"
  classification?: string;         // e.g. "AUTHORIZED FOR HIRE"
  mcNumber?: string;
  phyAddress?: string;
  totalDrivers?: number;
  totalPowerUnits?: number;
  safetyRating?: string;
  safetyRatingDate?: string;
  insuranceOnFile?: boolean;
  insuranceRequired?: boolean;
  operationClassification?: string[];
  recentCrashes?: { fatal?: number; injury?: number; tow?: number; total?: number };
  recentInspections?: {
    vehicleOosPct?: number;
    driverOosPct?: number;
    hazmatOosPct?: number;
    vehicleOosNational?: number;
    driverOosNational?: number;
    hazmatOosNational?: number;
  };
}

interface QcCarrier {
  dotNumber?: number | string;
  legalName?: string;
  dbaName?: string;
  statusCode?: string;
  allowedToOperate?: string;
  carrierOperation?: { carrierOperationDesc?: string; carrierOperationCode?: string };
  mcMxFfNumber?: string;
  phyStreet?: string;
  phyCity?: string;
  phyState?: string;
  phyZipcode?: string;
  phyCountry?: string;
  totalDrivers?: number;
  totalPowerUnits?: number;
  safetyRating?: string;
  safetyRatingDate?: string;
  bipdInsuranceOnFile?: string;
  bipdInsuranceRequired?: string;
  crashTotal?: number;
  fatalCrash?: number;
  injCrash?: number;
  towawayCrash?: number;
  vehicleOosRate?: number;
  driverOosRate?: number;
  hazmatOosRate?: number;
  vehicleOosRateNationalAverage?: string;
  driverOosRateNationalAverage?: string;
  hazmatOosRateNationalAverage?: string;
}

function headers(): HeadersInit {
  return { "User-Agent": UA, Accept: "application/json" };
}

function safetyDesc(code?: string): string | undefined {
  switch (code) {
    case "S": return "Satisfactory";
    case "C": return "Conditional";
    case "U": return "Unsatisfactory";
    case undefined: return undefined;
    default: return code;
  }
}

function roundPct(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined;
}

function toInt(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function lookupQc(dot: number, webKey: string): Promise<SaferCarrier | null> {
  const url = `${QCMOBILE}/${dot}?webKey=${encodeURIComponent(webKey)}`;
  const r = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!r.ok) return null;
  const raw = await r.json().catch(() => null) as { content?: { carrier?: QcCarrier } } | null;
  const c = raw?.content?.carrier;
  if (!c || !c.legalName) return null;

  const active = c.statusCode === "A";
  const addr = [c.phyStreet, c.phyCity, c.phyState, c.phyZipcode].filter(Boolean).join(", ") || undefined;

  // Fire off operation classification + authority calls in parallel for richer data
  const [opClass, authority] = await Promise.all([
    fetch(`${QCMOBILE}/${dot}/operation-classification?webKey=${encodeURIComponent(webKey)}`, { headers: headers(), cache: "no-store" })
      .then((x) => x.ok ? x.json() : null).catch(() => null) as Promise<{ content?: Array<{ operationClassDesc?: string }> } | null>,
    fetch(`${QCMOBILE}/${dot}/authority?webKey=${encodeURIComponent(webKey)}`, { headers: headers(), cache: "no-store" })
      .then((x) => x.ok ? x.json() : null).catch(() => null) as Promise<{ content?: Array<{ applicantID?: string; commonAuthorityStatus?: string; contractAuthorityStatus?: string }> } | null>,
  ]);

  const opList = opClass?.content?.map((o) => o.operationClassDesc).filter((x): x is string => !!x);
  const auth = authority?.content?.[0];
  const allowedToOperate =
    c.allowedToOperate === "Y" ||
    auth?.commonAuthorityStatus === "A" ||
    auth?.contractAuthorityStatus === "A";

  return {
    dotNumber: Number(c.dotNumber ?? dot),
    legalName: c.legalName.trim(),
    dbaName: c.dbaName?.trim() || undefined,
    status: active ? "Active" : "Inactive",
    allowedToOperate,
    entityType: c.carrierOperation?.carrierOperationDesc,
    classification: opList?.[0],
    mcNumber: c.mcMxFfNumber?.trim() || undefined,
    phyAddress: addr,
    totalDrivers: toInt(c.totalDrivers),
    totalPowerUnits: toInt(c.totalPowerUnits),
    safetyRating: safetyDesc(c.safetyRating),
    safetyRatingDate: c.safetyRatingDate,
    insuranceOnFile: (toInt(c.bipdInsuranceOnFile) ?? 0) > 0,
    insuranceRequired: c.bipdInsuranceRequired === "Y",
    operationClassification: opList,
    recentCrashes: {
      fatal: toInt(c.fatalCrash),
      injury: toInt(c.injCrash),
      tow: toInt(c.towawayCrash),
      total: toInt(c.crashTotal),
    },
    recentInspections: {
      vehicleOosPct: roundPct(c.vehicleOosRate),
      driverOosPct: roundPct(c.driverOosRate),
      hazmatOosPct: roundPct(c.hazmatOosRate),
      vehicleOosNational: roundPct(c.vehicleOosRateNationalAverage),
      driverOosNational: roundPct(c.driverOosRateNationalAverage),
      hazmatOosNational: roundPct(c.hazmatOosRateNationalAverage),
    },
  };
}

interface CensusRow {
  dot_number?: string; legal_name?: string; dba_name?: string;
  status_code?: string; classdef?: string; carrier_operation?: string;
  phy_street?: string; phy_city?: string; phy_state?: string; phy_zip?: string;
  total_drivers?: string; total_cdl?: string; power_units?: string; truck_units?: string;
  safety_rating?: string; docket1prefix?: string; docket1?: string;
}

async function lookupCensus(dot: number): Promise<SaferCarrier | null> {
  const r = await fetch(`${CENSUS}?dot_number=${dot}&$limit=1`, { headers: headers(), cache: "no-store" });
  if (!r.ok) return null;
  const rows = (await r.json().catch(() => [])) as CensusRow[];
  const c = rows[0];
  if (!c) return null;
  const active = c.status_code === "A";
  const mc = c.docket1prefix && c.docket1 ? `${c.docket1prefix}-${c.docket1}` : undefined;
  const addr = [c.phy_street, c.phy_city, c.phy_state, c.phy_zip].filter(Boolean).join(", ") || undefined;
  return {
    dotNumber: Number(c.dot_number ?? dot),
    legalName: (c.legal_name ?? "").trim(),
    dbaName: c.dba_name?.trim() || undefined,
    status: active ? "Active" : "Inactive",
    allowedToOperate: active,
    entityType: c.carrier_operation === "A" ? "Interstate" : c.carrier_operation === "B" ? "Intrastate (HM)" : c.carrier_operation === "C" ? "Intrastate" : undefined,
    classification: c.classdef?.trim() || undefined,
    mcNumber: mc,
    phyAddress: addr,
    totalDrivers: toInt(c.total_drivers) ?? toInt(c.total_cdl),
    totalPowerUnits: toInt(c.power_units) ?? toInt(c.truck_units),
    safetyRating: safetyDesc(c.safety_rating),
  };
}

export async function lookupCarrier(dot: number): Promise<SaferCarrier | null> {
  const key = process.env.FMCSA_WEBKEY;
  if (key) {
    const qc = await lookupQc(dot, key);
    if (qc) return qc;
  }
  return lookupCensus(dot);
}
