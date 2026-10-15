const HERE = {
  geocode:    "https://geocode.search.hereapi.com/v1/geocode",
  revgeocode: "https://revgeocode.search.hereapi.com/v1/revgeocode",
  routing:    "https://router.hereapi.com/v8/routes",
  discover:   "https://discover.search.hereapi.com/v1/discover",
  browse:     "https://browse.search.hereapi.com/v1/browse",
  matrix:     "https://matrix.router.hereapi.com/v8/matrix",
  isoline:    "https://isoline.router.hereapi.com/v8/isolines",
  incidents:  "https://data.traffic.hereapi.com/v7/incidents",
  autosuggest: "https://autosuggest.search.hereapi.com/v1/autosuggest",
  autocomplete:"https://autocomplete.search.hereapi.com/v1/autocomplete",
  lookup:      "https://lookup.search.hereapi.com/v1/lookup",
  multiRev:    "https://multi-revgeocode.search.hereapi.com/v1/multi-revgeocode",
  sequence:    "https://wps.hereapi.com/v8/findsequence2",
} as const;

function key(): string {
  const k = process.env.HERE_API_KEY;
  if (!k) throw new Error("HERE_API_KEY is not set");
  return k;
}

export interface LatLon { lat: number; lon: number }

export interface TruckProfile {
  heightMeters: number;
  weightKg: number;
  widthMeters?: number;
  lengthMeters?: number;
  axleCount?: number;
  hazardous?: boolean;
  trailerCount?: number;
}

export interface Place {
  title: string;
  address: string;
  position: LatLon;
  categories?: string[];
  ontology?: string;
  distanceMeters?: number;
}

// ---------- Geocoding ----------
export async function geocode(query: string): Promise<LatLon> {
  const url = `${HERE.geocode}?q=${encodeURIComponent(query)}&limit=1&apiKey=${key()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE geocode failed: ${res.status}`);
  const data = await res.json();
  const p = data.items?.[0]?.position;
  if (!p) throw new Error(`No geocode match for: ${query}`);
  return { lat: p.lat, lon: p.lng };
}

export async function reverseGeocode(at: LatLon): Promise<string> {
  const url = `${HERE.revgeocode}?at=${at.lat},${at.lon}&limit=1&apiKey=${key()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE revgeocode failed: ${res.status}`);
  const data = await res.json();
  return data.items?.[0]?.address?.label ?? `${at.lat.toFixed(5)}, ${at.lon.toFixed(5)}`;
}

export async function reverseState(at: LatLon): Promise<{ stateCode?: string; countryCode?: string }> {
  const url = `${HERE.revgeocode}?at=${at.lat},${at.lon}&limit=1&apiKey=${key()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return {};
  const data = await res.json();
  const a = data.items?.[0]?.address;
  return { stateCode: a?.stateCode, countryCode: a?.countryCode };
}

// ---------- Discover / browse ----------
export async function discover(query: string, near: LatLon, limit = 8): Promise<Place[]> {
  const url = `${HERE.discover}?q=${encodeURIComponent(query)}&at=${near.lat},${near.lon}&limit=${limit}&apiKey=${key()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE discover failed: ${res.status}`);
  const data = await res.json();
  return mapPlaces(data.items ?? []);
}

export type TruckPoiKind = "parking" | "stop" | "rest" | "weigh";

const KIND_QUERY: Record<TruckPoiKind, string> = {
  parking: "truck parking",
  stop:    "truck stop",
  rest:    "rest area",
  weigh:   "weigh station",
};

export async function browseTruckPois(
  kinds: TruckPoiKind[],
  near: LatLon,
  limit = 30,
): Promise<Place[]> {
  const per = Math.max(5, Math.ceil(limit / kinds.length));
  const batches = await Promise.all(
    kinds.map((k) =>
      discover(KIND_QUERY[k], near, per).then((ps) => ps.map((p) => ({ ...p, ontology: k }))),
    ),
  );
  return dedupe(batches.flat()).slice(0, limit);
}

function mapPlaces(items: unknown[]): Place[] {
  return (items as Array<{
    title: string;
    address?: { label?: string };
    position: { lat: number; lng: number };
    categories?: Array<{ name: string; id?: string }>;
    ontologyId?: string;
    distance?: number;
  }>).map((it) => ({
    title: it.title,
    address: it.address?.label ?? "",
    position: { lat: it.position.lat, lon: it.position.lng },
    categories: it.categories?.map((c) => c.name),
    ontology: it.ontologyId,
    distanceMeters: it.distance,
  }));
}

function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const k = `${p.position.lat.toFixed(4)},${p.position.lon.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- Routing (truck) ----------
export interface RouteSpan {
  offset: number;
  speedLimit?: number;
  truckSpeedLimit?: number;
  dynamicSpeedInfo?: { baseSpeed?: number; trafficSpeed?: number; jamFactor?: number };
  notices?: number[];
}

export interface TruckTollSummary { currency?: string; total?: number }

export interface TruckRouteOption {
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
  notices: Array<{ title: string; code: string; severity: string }>;
  spans: RouteSpan[];
  tolls?: TruckTollSummary;
}

export interface TruckRouteResult {
  origin: LatLon;
  destination: LatLon;
  primary: TruckRouteOption;
  alternates: TruckRouteOption[];
}

export interface TruckRouteOpts {
  /** HERE `avoid[areas]` value, e.g. "bbox:west,south,east,north|bbox:..." */
  avoidAreas?: string;
}

export async function truckRoute(
  origin: LatLon,
  destination: LatLon,
  profile: TruckProfile,
  opts: TruckRouteOpts = {},
): Promise<TruckRouteResult> {
  const params = new URLSearchParams({
    transportMode: "truck",
    origin: `${origin.lat},${origin.lon}`,
    destination: `${destination.lat},${destination.lon}`,
    return: "polyline,summary,actions,instructions,tolls,travelSummary",
    spans: "speedLimit,dynamicSpeedInfo,notices,truckAttributes",
    alternatives: "2",
    // Keep commercial trucks on paved, year-round-open, truck-legal roads.
    // `dirtRoad` = unpaved, `seasonalClosure` = snow-only / weather-closed,
    // `difficultTurns` = anything HERE flags as impractical for large vehicles.
    "avoid[features]": "dirtRoad,seasonalClosure,difficultTurns",
    "vehicle[height]": String(Math.round(profile.heightMeters * 100)),
    "vehicle[grossWeight]": String(profile.weightKg),
    apiKey: key(),
  });
  if (profile.widthMeters)  params.set("vehicle[width]",  String(Math.round(profile.widthMeters * 100)));
  if (profile.lengthMeters) params.set("vehicle[length]", String(Math.round(profile.lengthMeters * 100)));
  if (profile.axleCount)    params.set("vehicle[axleCount]", String(profile.axleCount));
  if (profile.hazardous)    params.set("vehicle[shippedHazardousGoods]", "explosive");
  if (profile.trailerCount) params.set("vehicle[trailerCount]", String(profile.trailerCount));
  if (opts.avoidAreas)      params.set("avoid[areas]", opts.avoidAreas);

  const res = await fetch(`${HERE.routing}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HERE routing failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const routes: Array<{ sections: Array<{
    departure?: { place?: { location?: { lat: number; lng: number } } };
    arrival?:   { place?: { location?: { lat: number; lng: number } } };
  }> }> = data.routes ?? [];
  if (routes.length === 0) throw new Error("No route returned");

  // HERE does NOT error when a destination is unreachable for the given
  // vehicle profile — it silently snaps to the nearest drivable point and
  // returns a "route" that doesn't go where we asked. It also doesn't emit
  // any notice. So we have to detect it ourselves by comparing the arrival
  // (and departure) coordinates of the first section against what we sent.
  const first = routes[0].sections[0];
  const arr = first.arrival?.place?.location;
  const dep = first.departure?.place?.location;
  const arrMiss = arr ? haversineKm({ lat: arr.lat, lon: arr.lng }, destination) : 0;
  const depMiss = dep ? haversineKm({ lat: dep.lat, lon: dep.lng }, origin) : 0;
  // 5 km tolerance — HERE legitimately snaps origin/destination to the
  // nearest routable edge (driveway, highway ramp). Anything beyond that
  // is HERE giving up.
  if (arrMiss > 5 || depMiss > 5) {
    throw new Error(
      `No truck-legal route exists for this vehicle profile. HERE could only reach within ` +
      `${arrMiss.toFixed(0)} km of the destination (origin off by ${depMiss.toFixed(0)} km). ` +
      `Reduce weight, change route, or apply for an oversize/overweight permit.`
    );
  }

  const options = routes.map(routeToOption);
  return { origin, destination, primary: options[0], alternates: options.slice(1) };
}

function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function routeToOption(raw: unknown): TruckRouteOption {
  const r = raw as {
    sections: Array<{
      polyline: string;
      summary: { length: number; duration: number };
      tolls?: Array<{ fares?: Array<{ price?: { value?: number; currency?: string } }> }>;
      spans?: RouteSpan[];
      notices?: Array<{ title: string; code: string; severity: string; details?: unknown }>;
    }>;
    notices?: Array<{ title: string; code: string; severity: string; details?: unknown }>;
  };
  const s = r.sections[0];
  let tollTotal = 0;
  let tollCurrency: string | undefined;
  for (const sec of r.sections) {
    for (const t of sec.tolls ?? []) {
      for (const f of t.fares ?? []) {
        if (f.price?.value) {
          tollTotal += f.price.value;
          tollCurrency = tollCurrency ?? f.price.currency;
        }
      }
    }
  }

  // Aggregate notices from both the route envelope AND each section — HERE
  // reports vehicle-restriction violations (violatedGrossWeight, violatedHeight,
  // etc.) at the section level, so only reading `r.notices` hides them.
  const seen = new Set<string>();
  const notices: Array<{ title: string; code: string; severity: string }> = [];
  const push = (n: { title: string; code: string; severity: string }) => {
    const k = `${n.code}|${n.title}`;
    if (seen.has(k)) return;
    seen.add(k);
    notices.push({ title: n.title, code: n.code, severity: n.severity });
  };
  for (const n of r.notices ?? []) push(n);
  for (const sec of r.sections) for (const n of sec.notices ?? []) push(n);

  return {
    polyline: s.polyline,
    distanceMeters: r.sections.reduce((a, x) => a + x.summary.length, 0),
    durationSeconds: r.sections.reduce((a, x) => a + x.summary.duration, 0),
    notices,
    spans: s.spans ?? [],
    tolls: tollTotal > 0 ? { currency: tollCurrency, total: tollTotal } : undefined,
  };
}

// ---------- Matrix Routing ----------
// "Which of these trucks can reach this pickup fastest?" N×M truck travel times.

export interface MatrixResult {
  // travelTimes[i*numDestinations + j] = seconds from origin i to destination j
  travelTimes: number[];
  numOrigins: number;
  numDestinations: number;
}

export async function matrixRoute(
  origins: LatLon[],
  destinations: LatLon[],
  profile?: TruckProfile,
): Promise<MatrixResult> {
  const body: Record<string, unknown> = {
    origins:      origins.map((p) => ({ lat: p.lat, lng: p.lon })),
    destinations: destinations.map((p) => ({ lat: p.lat, lng: p.lon })),
    regionDefinition: { type: "world" },
    transportMode: "truck",
    avoid: { features: ["dirtRoad", "seasonalClosure", "difficultTurns"] },
  };
  if (profile) {
    const profileObj: Record<string, unknown> = {
      height:      Math.round(profile.heightMeters * 100),
      grossWeight: profile.weightKg,
    };
    if (profile.axleCount)    profileObj.axleCount    = profile.axleCount;
    if (profile.trailerCount) profileObj.trailerCount = profile.trailerCount;
    if (profile.widthMeters)  profileObj.width        = Math.round(profile.widthMeters * 100);
    if (profile.lengthMeters) profileObj.length       = Math.round(profile.lengthMeters * 100);
    if (profile.hazardous)    profileObj.shippedHazardousGoods = ["explosive"];
    body.truckProfile = profileObj;
  }
  const res = await fetch(`${HERE.matrix}?async=false&apiKey=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HERE matrix failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    travelTimes:     data.matrix.travelTimes ?? [],
    numOrigins:      data.matrix.numOrigins,
    numDestinations: data.matrix.numDestinations,
  };
}

// ---------- Isoline ----------
// Drive-time reachability polygons from an origin. "Where can this truck be in 2h / 4h / 8h?"

export interface IsolineRange {
  rangeSeconds: number;
  polygon: string;   // HERE flexible polyline (outer ring)
}

export async function isoline(
  origin: LatLon,
  rangeSeconds: number[],
  profile?: TruckProfile,
): Promise<IsolineRange[]> {
  const params = new URLSearchParams({
    transportMode: "truck",
    origin:        `${origin.lat},${origin.lon}`,
    "range[type]":   "time",
    "range[values]": rangeSeconds.join(","),
    "avoid[features]": "dirtRoad,seasonalClosure,difficultTurns",
    apiKey: key(),
  });
  if (profile) {
    params.set("vehicle[height]",      String(Math.round(profile.heightMeters * 100)));
    params.set("vehicle[grossWeight]", String(profile.weightKg));
    if (profile.axleCount)    params.set("vehicle[axleCount]",    String(profile.axleCount));
    if (profile.trailerCount) params.set("vehicle[trailerCount]", String(profile.trailerCount));
    if (profile.hazardous)    params.set("vehicle[shippedHazardousGoods]", "explosive");
  }
  const res = await fetch(`${HERE.isoline}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HERE isoline failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const out: IsolineRange[] = [];
  for (const iso of data.isolines ?? []) {
    const outer = iso.polygons?.[0]?.outer;
    if (outer) out.push({ rangeSeconds: iso.range.value, polygon: outer });
  }
  return out;
}

// ---------- Traffic Incidents ----------
// Active incidents inside a bounding box (accidents, construction, closures).

export interface TrafficIncident {
  id: string;
  description: string;
  type: string;          // e.g. "accident", "construction", "roadClosure"
  criticality: number;   // 0 = low, 3 = critical (HERE scale)
  startTime?: string;
  endTime?: string;
  position: LatLon;      // representative point of the shape
  roadName?: string;
}

export async function trafficIncidents(bbox: {
  west: number; south: number; east: number; north: number;
}): Promise<TrafficIncident[]> {
  // HERE caps each request at a 1° × 1° bbox. Tile the request.
  const tiles: Array<{ west: number; south: number; east: number; north: number }> = [];
  for (let w = bbox.west; w < bbox.east; w += 1) {
    const e = Math.min(w + 1, bbox.east);
    for (let s = bbox.south; s < bbox.north; s += 1) {
      const n = Math.min(s + 1, bbox.north);
      tiles.push({ west: w, south: s, east: e, north: n });
    }
  }
  const seen = new Map<string, TrafficIncident>();
  const queue = [...tiles];
  async function worker() {
    while (queue.length) {
      const t = queue.shift()!;
      const params = new URLSearchParams({
        in: `bbox:${t.west},${t.south},${t.east},${t.north}`,
        locationReferencing: "shape",
        apiKey: key(),
      });
      try {
        const res = await fetch(`${HERE.incidents}?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        for (const r of data.results ?? []) {
          const inc = r.incidentDetails ?? {};
          const loc = r.location?.shape?.links?.[0]?.points?.[0];
          if (!loc) continue;
          const id = String(inc.id ?? r.incidentId ?? `${loc.lat},${loc.lng}|${inc.summary?.value}`);
          if (seen.has(id)) continue;
          seen.set(id, {
            id,
            description: String(inc.description?.value ?? inc.summary?.value ?? "Incident"),
            type:        String(inc.type ?? "unknown"),
            criticality: Number(inc.criticality ?? 0),
            startTime:   inc.startTime,
            endTime:     inc.endTime,
            position:    { lat: loc.lat, lon: loc.lng },
            roadName:    r.location?.description?.value,
          });
        }
      } catch {
        // per-tile failures are tolerated
      }
    }
  }
  // up to 6 parallel tile fetches
  await Promise.all(Array.from({ length: Math.min(6, tiles.length) }, () => worker()));
  return Array.from(seen.values());
}

// ---------- Search along route ----------
// HERE's /discover `route=` param has URL-length limits for long polylines, so
// we sample the decoded polyline ourselves and query Browse at each sample,
// deduping by place id. Good enough for truck-stops / fuel / rest-area hunting.

export interface AlongRoutePlace {
  id: string;
  title: string;
  position: LatLon;
  address?: string;
  category?: string;
  distanceMeters?: number;
}

/** Sample a decoded polyline approximately every `stepKm` kilometers. */
function sampleEveryKm(coords: LatLon[], stepKm: number): LatLon[] {
  if (coords.length === 0) return [];
  const out: LatLon[] = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    acc += 2 * R * Math.asin(Math.sqrt(s));
    if (acc >= stepKm) { out.push(b); acc = 0; }
  }
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

export async function placesAlongRoute(args: {
  decodedPolyline: LatLon[];
  /** HERE category ids: 700-7600-0116 = Fuel, 700-7600-0322 = Truck stop, 700-7600-0000 = Rest area */
  categories: string[];
  stepKm?: number;
  radiusKm?: number;
  perSampleLimit?: number;
}): Promise<AlongRoutePlace[]> {
  const { decodedPolyline, categories, stepKm = 40, radiusKm = 8, perSampleLimit = 8 } = args;
  if (decodedPolyline.length < 2) return [];
  const samples = sampleEveryKm(decodedPolyline, stepKm);
  const cats = categories.join(",");
  const seen = new Map<string, AlongRoutePlace>();
  // Fan out but don't hammer HERE — cap concurrency at 4.
  const queue = [...samples];
  async function worker() {
    while (queue.length) {
      const p = queue.shift()!;
      const params = new URLSearchParams({
        at:    `${p.lat},${p.lon}`,
        categories: cats,
        limit: String(perSampleLimit),
        in:    `circle:${p.lat},${p.lon};r=${Math.round(radiusKm * 1000)}`,
        apiKey: key(),
      });
      try {
        const r = await fetch(`${HERE.browse}?${params.toString()}`, { cache: "no-store" });
        if (!r.ok) continue;
        const d = await r.json();
        for (const item of d.items ?? []) {
          const id = String(item.id);
          if (seen.has(id)) continue;
          seen.set(id, {
            id,
            title:    item.title,
            position: { lat: item.position.lat, lon: item.position.lng },
            address:  item.address?.label,
            category: item.categories?.[0]?.name,
            distanceMeters: item.distance,
          });
        }
      } catch {
        // swallow; partial results are fine
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return Array.from(seen.values());
}

// ---------- Autosuggest (address/POI autocomplete) ----------

export interface AutosuggestItem {
  title: string;
  label?: string;
  resultType?: string;
  position?: LatLon;
  distance?: number;
}

export async function autosuggest(
  query: string,
  biasAt?: LatLon,
  limit: number = 6,
): Promise<AutosuggestItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    apiKey: key(),
  });
  // Autosuggest requires either `at=` (bias point) or `in=` (bbox/circle).
  // Center of CONUS is a reasonable default when caller doesn't bias.
  params.set("at", biasAt ? `${biasAt.lat},${biasAt.lon}` : "39.5,-98.35");
  const res = await fetch(`${HERE.autosuggest}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE autosuggest failed: ${res.status}`);
  const data = await res.json();
  const out: AutosuggestItem[] = [];
  for (const item of data.items ?? []) {
    const pos = item.position;
    out.push({
      title: item.title,
      label: item.address?.label,
      resultType: item.resultType,
      position: pos ? { lat: pos.lat, lon: pos.lng } : undefined,
      distance: item.distance,
    });
  }
  return out;
}

// ---------- Waypoint Sequence (TSP) ----------
// Given N stops, returns the optimal visit order for a truck.

export interface SequenceStop {
  id: string;       // must be unique
  lat: number;
  lon: number;
}

export interface SequenceResult {
  orderedIds: string[];
  distanceMeters: number;
  durationSeconds: number;
}

export async function sequenceStops(args: {
  start: SequenceStop;
  end?: SequenceStop;            // if omitted, open tour (driver doesn't return)
  middle: SequenceStop[];        // the stops to be optimized
  improveFor?: "time" | "distance";
}): Promise<SequenceResult> {
  const { start, end, middle, improveFor = "time" } = args;
  if (middle.length === 0) throw new Error("at least 1 intermediate stop required");

  const seenIds = new Set<string>();
  const assertUnique = (id: string) => {
    if (seenIds.has(id)) throw new Error(`duplicate stop id: ${id}`);
    seenIds.add(id);
  };
  assertUnique(start.id);
  middle.forEach((m) => assertUnique(m.id));
  if (end) assertUnique(end.id);

  const params = new URLSearchParams({
    start: `${start.id};${start.lat},${start.lon}`,
    mode: "fastest;truck;traffic:disabled",
    improveFor,
    apiKey: key(),
  });
  middle.forEach((m, i) => params.set(`destination${i + 1}`, `${m.id};${m.lat},${m.lon}`));
  if (end) params.set("end", `${end.id};${end.lat},${end.lon}`);

  const res = await fetch(`${HERE.sequence}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE sequence failed: ${res.status}`);
  const data = await res.json();
  const r = data.results?.[0];
  if (!r) throw new Error(data?.errors?.[0] ?? "no sequence result");

  // Sum distance/time from interConnections if present, else 0
  let distance = 0, time = 0;
  for (const ic of r.interconnections ?? []) {
    distance += Number(ic.distance ?? 0);
    time += Number(ic.time ?? 0);
  }
  return {
    orderedIds: (r.waypoints ?? []).map((w: { id: string }) => w.id),
    distanceMeters: distance,
    durationSeconds: time,
  };
}

// ---------- EV Charging (Browse) ----------
// Not fuel — this is a separate POI category for electric fleets.

export async function evCharging(at: LatLon, limit: number = 20): Promise<Place[]> {
  const params = new URLSearchParams({
    at: `${at.lat},${at.lon}`,
    categories: "700-7600-0322",   // EV Charging Station
    limit: String(limit),
    apiKey: key(),
  });
  const res = await fetch(`${HERE.browse}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE EV charging failed: ${res.status}`);
  const data = await res.json();
  const out: Place[] = [];
  for (const it of data.items ?? []) {
    out.push({
      title:    it.title,
      address:  it.address?.label ?? "",
      position: { lat: it.position.lat, lon: it.position.lng },
      categories: (it.categories ?? []).map((c: { name: string }) => c.name),
      ontology: "ev",
      distanceMeters: it.distance,
    });
  }
  return out;
}

// ---------- Autocomplete (HERE Search v7) ----------
// Lighter/faster than autosuggest; no spell correction. Good for address-only completion.

export interface AutocompleteItem {
  title: string;
  label?: string;
  countryCode?: string;
  id?: string;
}

export async function autocomplete(query: string, biasAt?: LatLon, limit = 6): Promise<AutocompleteItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: String(limit), apiKey: key() });
  if (biasAt) params.set("at", `${biasAt.lat},${biasAt.lon}`);
  const res = await fetch(`${HERE.autocomplete}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE autocomplete failed: ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((i: { title: string; address?: { label?: string; countryCode?: string }; id?: string }) => ({
    title: i.title,
    label: i.address?.label,
    countryCode: i.address?.countryCode,
    id: i.id,
  }));
}

// ---------- Lookup by ID (HERE Search v7) ----------
// Fetch the full place record for a HERE location id (from autosuggest/autocomplete/discover).

export interface LookupResult {
  id: string;
  title: string;
  address?: { label?: string; countryCode?: string; state?: string; city?: string; postalCode?: string };
  position?: LatLon;
  access?: LatLon[];         // entry points (gate/dock coordinates) for warehouses
  categories?: string[];
  chains?: string[];
  contacts?: { phone?: string; www?: string; email?: string };
  openingHours?: Array<{ text?: string[] }>;
}

export async function lookupById(id: string): Promise<LookupResult> {
  const params = new URLSearchParams({ id, apiKey: key() });
  const res = await fetch(`${HERE.lookup}?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HERE lookup failed: ${res.status}`);
  const d = await res.json();
  return {
    id: d.id ?? id,
    title: d.title ?? "",
    address: d.address ? {
      label: d.address.label,
      countryCode: d.address.countryCode,
      state: d.address.state,
      city: d.address.city,
      postalCode: d.address.postalCode,
    } : undefined,
    position: d.position ? { lat: d.position.lat, lon: d.position.lng } : undefined,
    access: Array.isArray(d.access) ? d.access.map((p: { lat: number; lng: number }) => ({ lat: p.lat, lon: p.lng })) : undefined,
    categories: (d.categories ?? []).map((c: { name: string }) => c.name),
    chains: (d.chains ?? []).map((c: { name: string }) => c.name),
    contacts: d.contacts?.[0] ? {
      phone: d.contacts[0].phone?.[0]?.value,
      www:   d.contacts[0].www?.[0]?.value,
      email: d.contacts[0].email?.[0]?.value,
    } : undefined,
    openingHours: d.openingHours,
  };
}

// ---------- Multi-Reverse Geocode (HERE Search v7) ----------
// POST batch: N coords → N nearest-address labels in one call.
// Useful for IFTA/trip-point labeling or bulk fleet positions.

export interface MultiRevItem {
  lat: number;
  lon: number;
  label?: string;
  stateCode?: string;
  countryCode?: string;
}

export async function multiReverseGeocode(points: LatLon[]): Promise<MultiRevItem[]> {
  if (points.length === 0) return [];
  // HERE multi-revgeocode body: newline-separated query strings, one per sub-request.
  // Each sub-request MUST include `id=` plus `at=lat,lng`. Content-Type is text/plain.
  const body = points
    .map((p, i) => `id=${i}&at=${p.lat},${p.lon}`)
    .join("\n");
  const res = await fetch(`${HERE.multiRev}?apiKey=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=UTF-8" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HERE multi-revgeocode failed: ${res.status} ${text}`);
  }
  const d = await res.json();
  // Response: { results: [{ id, items: [{ address, position, access, ... }] }] }
  const byId = new Map<string, { label?: string; stateCode?: string; countryCode?: string }>();
  for (const r of d.results ?? []) {
    const it = r.items?.[0];
    if (!it) continue;
    byId.set(String(r.id), {
      label:       it.address?.label,
      stateCode:   it.address?.stateCode,
      countryCode: it.address?.countryCode,
    });
  }
  return points.map((p, i) => {
    const hit = byId.get(String(i)) ?? {};
    return { lat: p.lat, lon: p.lon, ...hit };
  });
}

// ---------- Tour Planning (VRP) ----------
// Async-capable multi-vehicle optimizer. We use sync mode here — fine for
// small problems (dozens of stops). For hundreds of stops, switch to async.

export interface VrpVehicleType {
  /** Unique, e.g. "box-truck" */
  id: string;
  profile: "truck" | "car";
  /** How many vehicles of this type available */
  amount: number;
  /** Capacity per vehicle — array so you can model multi-dim (weight, pallets, …) */
  capacity: number[];
  /** ISO start / end times & locations for the shift */
  shiftStart: { iso: string; location: LatLon };
  shiftEnd:   { iso: string; location: LatLon };
  costs?: { fixed?: number; distance?: number; time?: number };
}

export interface VrpJob {
  id: string;
  location: LatLon;
  /** Seconds the driver spends at this stop */
  serviceDurationSec?: number;
  /** Quantities this job adds/removes from the truck, same dimension as capacity */
  demand: number[];
  /** optional time window — array of [start, end] ISOs */
  timeWindows?: Array<[string, string]>;
}

export interface VrpSolutionStop {
  jobId: string;
  location: LatLon;
  arrivalISO?: string;
  departureISO?: string;
  activityType: string;   // "departure" | "delivery" | "pickup" | "arrival" etc.
  loadAfter?: number[];
}

export interface VrpSolutionTour {
  vehicleId: string;
  typeId: string;
  stops: VrpSolutionStop[];
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface VrpSolution {
  tours: VrpSolutionTour[];
  unassigned: Array<{ jobId: string; reasons: string[] }>;
  statistic: {
    costTotal?: number;
    distanceMeters: number;
    durationSeconds: number;
  };
}

export async function tourPlan(args: {
  types: VrpVehicleType[];
  jobs: VrpJob[];
}): Promise<VrpSolution> {
  const { types, jobs } = args;
  if (types.length === 0) throw new Error("at least one vehicle type required");
  if (jobs.length === 0)  throw new Error("at least one job required");

  const body = {
    fleet: {
      types: types.map((t) => ({
        id:     t.id,
        profile:"truck",
        costs:  { fixed: t.costs?.fixed ?? 22, distance: t.costs?.distance ?? 0.0001, time: t.costs?.time ?? 0.0048 },
        shifts: [{
          start: { time: t.shiftStart.iso, location: { lat: t.shiftStart.location.lat, lng: t.shiftStart.location.lon } },
          end:   { time: t.shiftEnd.iso,   location: { lat: t.shiftEnd.location.lat,   lng: t.shiftEnd.location.lon } },
        }],
        amount:   t.amount,
        capacity: t.capacity,
      })),
      profiles: [{ name: "truck", type: "truck" }],
    },
    plan: {
      jobs: jobs.map((j) => ({
        id: j.id,
        tasks: {
          deliveries: [{
            places: [{
              location: { lat: j.location.lat, lng: j.location.lon },
              duration: j.serviceDurationSec ?? 600,
              ...(j.timeWindows && j.timeWindows.length
                ? { times: j.timeWindows }
                : {}),
            }],
            demand: j.demand,
          }],
        },
      })),
    },
  };

  const res = await fetch(`https://tourplanning.hereapi.com/v3/problems?apiKey=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HERE tour plan failed: ${res.status} ${text}`);
  }
  const d = await res.json();

  // Normalize shape
  const tours: VrpSolutionTour[] = (d.tours ?? []).map((t: {
    vehicleId: string;
    typeId: string;
    stops: Array<{
      time?: { arrival?: string; departure?: string };
      load?: number[];
      location?: { lat: number; lng: number };
      activities?: Array<{ jobId: string; type: string; location?: { lat: number; lng: number } }>;
    }>;
    statistic?: { distance?: number; duration?: number };
  }) => ({
    vehicleId: t.vehicleId,
    typeId:    t.typeId,
    stops: (t.stops ?? []).flatMap((s) =>
      (s.activities ?? []).map((a) => ({
        jobId:        a.jobId,
        activityType: a.type,
        location:     a.location
          ? { lat: a.location.lat, lon: a.location.lng }
          : s.location
            ? { lat: s.location.lat, lon: s.location.lng }
            : { lat: 0, lon: 0 },
        arrivalISO:   s.time?.arrival,
        departureISO: s.time?.departure,
        loadAfter:    s.load,
      }))
    ),
    distanceMeters:  t.statistic?.distance,
    durationSeconds: t.statistic?.duration,
  }));

  const unassigned = (d.unassigned ?? []).map((u: { jobId: string; reasons?: Array<{ description: string }> }) => ({
    jobId: u.jobId,
    reasons: (u.reasons ?? []).map((r) => r.description),
  }));

  return {
    tours,
    unassigned,
    statistic: {
      costTotal:      d.statistic?.cost,
      distanceMeters: d.statistic?.distance ?? 0,
      durationSeconds:d.statistic?.duration ?? 0,
    },
  };
}
