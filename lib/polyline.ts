// Minimal decoder for HERE's Flexible Polyline format (server-side, no deps).
// Spec: https://github.com/heremaps/flexible-polyline

const DECODING_TABLE = [
  62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34,
  35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
];

function decodeChar(c: string): number {
  const code = c.charCodeAt(0) - 45;
  const v = DECODING_TABLE[code];
  if (v === undefined || v < 0) throw new Error(`Invalid char in polyline: ${c}`);
  return v;
}

function decodeUnsigned(encoded: string, start: number): { value: number; next: number } {
  let result = 0, shift = 0, i = start;
  for (;;) {
    const v = decodeChar(encoded[i]);
    i++;
    result |= (v & 0x1f) << shift;
    if ((v & 0x20) === 0) break;
    shift += 5;
    if (shift > 64) throw new Error("Polyline varint overflow");
  }
  return { value: result, next: i };
}

function decodeSignedVarint(encoded: string, start: number): { value: number; next: number } {
  const u = decodeUnsigned(encoded, start);
  const sign = u.value & 1 ? ~(u.value >>> 1) : u.value >>> 1;
  return { value: sign, next: u.next };
}

export interface LatLon { lat: number; lon: number }

export function decodeFlexiblePolyline(encoded: string): LatLon[] {
  if (!encoded) return [];
  let i = 0;

  // Header: version + (precision, third-dim, third-dim-precision)
  const version = decodeUnsigned(encoded, i); i = version.next;
  if (version.value !== 1) throw new Error(`Unsupported polyline version ${version.value}`);
  const h2 = decodeUnsigned(encoded, i); i = h2.next;
  const precision = h2.value & 0x0f;
  const thirdDim = (h2.value >> 4) & 0x07;
  const thirdDimPrecision = (h2.value >> 7) & 0x0f;

  const factor = Math.pow(10, precision);
  const factor3 = Math.pow(10, thirdDimPrecision);
  const hasThird = thirdDim !== 0;

  const out: LatLon[] = [];
  let lastLat = 0, lastLon = 0, lastZ = 0;
  while (i < encoded.length) {
    const dLat = decodeSignedVarint(encoded, i); i = dLat.next;
    const dLon = decodeSignedVarint(encoded, i); i = dLon.next;
    lastLat += dLat.value;
    lastLon += dLon.value;
    if (hasThird) {
      const dZ = decodeSignedVarint(encoded, i); i = dZ.next;
      lastZ += dZ.value;
      void factor3; void lastZ; // discard
    }
    out.push({ lat: lastLat / factor, lon: lastLon / factor });
  }
  return out;
}
