export interface GeoPoint {
  lat: number;
  lng: number;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest-neighbor tour starting at the first stop (EconoRoute-style optimizer). */
export function optimizeStopOrder<T extends { lat: number | null; lng: number | null }>(
  stops: T[]
): T[] {
  if (stops.length <= 2) return stops.map((s, i) => ({ ...s, sequence: i } as T));

  const withGeo = stops.filter((s) => s.lat != null && s.lng != null);
  const withoutGeo = stops.filter((s) => s.lat == null || s.lng == null);

  if (withGeo.length <= 1) {
    return stops.map((s, i) => ({ ...s, sequence: i }));
  }

  const remaining = [...withGeo];
  const ordered: T[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((stop, idx) => {
      const d = haversineKm(
        { lat: last.lat as number, lng: last.lng as number },
        { lat: stop.lat as number, lng: stop.lng as number }
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return [...ordered, ...withoutGeo].map((s, i) => ({ ...s, sequence: i }));
}

export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'PharmaFlow/1.0' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
