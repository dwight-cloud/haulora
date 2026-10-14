import { NextRequest, NextResponse } from "next/server";
import { placesAlongRoute } from "@/lib/here";
import { decodeFlexiblePolyline } from "@/lib/polyline";

export const runtime = "nodejs";

/**
 * GET /api/places/along-route?polyline=&kinds=fuel,stop,rest&stepKm=40&radiusKm=8
 *
 * kinds map to HERE category IDs:
 *   fuel    = 700-7600-0116  (Petrol/Gasoline Station)
 *   stop    = 700-7600-0322  (Truck stop)
 *   rest    = 400-4300-0000  (Rest area)
 *   parking = 800-8500-0000  (Parking facility)
 */
const KIND_CATS: Record<string, string> = {
  fuel:    "700-7600-0116",
  stop:    "700-7600-0322",
  rest:    "400-4300-0000",
  parking: "800-8500-0000",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const poly = searchParams.get("polyline");
    if (!poly) return NextResponse.json({ error: "polyline required" }, { status: 400 });

    const kinds = (searchParams.get("kinds") ?? "fuel,stop,rest")
      .split(",").map((s) => s.trim()).filter((s) => s in KIND_CATS);
    if (kinds.length === 0) {
      return NextResponse.json({ error: "kinds must include fuel|stop|rest|parking" }, { status: 400 });
    }

    const stepKm   = Math.max(5, parseFloat(searchParams.get("stepKm")   ?? "40"));
    const radiusKm = Math.max(1, parseFloat(searchParams.get("radiusKm") ?? "8"));

    const decoded = decodeFlexiblePolyline(poly);
    if (decoded.length < 2) return NextResponse.json({ error: "empty polyline" }, { status: 400 });

    const categories = kinds.map((k) => KIND_CATS[k]);
    const items = await placesAlongRoute({
      decodedPolyline: decoded,
      categories,
      stepKm,
      radiusKm,
      perSampleLimit: 8,
    });

    return NextResponse.json({ items, kinds, stepKm, radiusKm });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
