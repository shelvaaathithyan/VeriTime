// backend/src/services/commuteService.ts
// Estimates a student's home → campus commute using the Google Maps Routes API
// (traffic-aware). Falls back to a straight-line estimate if the API is
// unavailable so check-ins never fail because of a maps outage.

export interface CommuteEstimate {
  distanceKm: number;
  durationMinutes: number;      // with current traffic
  typicalMinutes: number;       // same route without traffic
  trafficDelayMinutes: number;  // durationMinutes - typicalMinutes (never negative)
  source: 'GOOGLE_ROUTES' | 'ESTIMATE';
}

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const REQUEST_TIMEOUT_MS = 5000;

function getCampus(): { lat: number; lng: number } {
  return {
    lat: Number(process.env.CAMPUS_LAT || 11.0242544),
    lng: Number(process.env.CAMPUS_LNG || 77.0028228),
  };
}

function parseSeconds(duration: string | undefined): number {
  // Routes API returns durations like "4241s"
  return duration ? Number(duration.replace('s', '')) : 0;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fallbackEstimate(homeLat: number, homeLng: number): CommuteEstimate {
  const campus = getCampus();
  // Road distance is roughly 1.3x straight-line; assume ~35 km/h average city/highway mix
  const distanceKm = haversineKm(homeLat, homeLng, campus.lat, campus.lng) * 1.3;
  const minutes = Math.round((distanceKm / 35) * 60);
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes: minutes,
    typicalMinutes: minutes,
    trafficDelayMinutes: 0,
    source: 'ESTIMATE',
  };
}

export async function estimateCommute(homeLat: number, homeLng: number): Promise<CommuteEstimate> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_MAPS_API_KEY not set — using straight-line commute estimate');
    return fallbackEstimate(homeLat, homeLng);
  }

  const campus = getCampus();
  try {
    const response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: homeLat, longitude: homeLng } } },
        destination: { location: { latLng: { latitude: campus.lat, longitude: campus.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`Routes API returned HTTP ${response.status} — using fallback estimate`);
      return fallbackEstimate(homeLat, homeLng);
    }

    const body = (await response.json()) as any;
    const route = body.routes?.[0];
    if (!route) return fallbackEstimate(homeLat, homeLng);

    const durationMinutes = Math.round(parseSeconds(route.duration) / 60);
    const typicalMinutes = Math.round(parseSeconds(route.staticDuration || route.duration) / 60);
    return {
      distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
      durationMinutes,
      typicalMinutes,
      trafficDelayMinutes: Math.max(0, durationMinutes - typicalMinutes),
      source: 'GOOGLE_ROUTES',
    };
  } catch (err) {
    console.warn('Routes API request failed — using fallback estimate:', (err as Error).message);
    return fallbackEstimate(homeLat, homeLng);
  }
}
