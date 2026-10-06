// backend/src/services/weatherService.ts
// Fetches current weather from OpenWeatherMap so lateness can be checked against
// real conditions at the student's home (start of the commute) and on campus.

export type WeatherSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface WeatherReport {
  condition: string;      // e.g. "Rain", "Thunderstorm", "Clouds"
  description: string;    // e.g. "heavy intensity rain"
  severity: WeatherSeverity;
  rainMmLastHour: number;
  location: string;       // where this reading was taken, e.g. "Pollachi" or "Campus"
}

const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const REQUEST_TIMEOUT_MS = 5000;
const SEVERITY_RANK: Record<WeatherSeverity, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

// Maps OpenWeatherMap condition codes (https://openweathermap.org/weather-conditions)
// to how likely they are to disrupt a commute.
function severityFromCode(code: number, rainMm: number): WeatherSeverity {
  if (code >= 200 && code < 300) return 'HIGH';                              // thunderstorm
  if ([502, 503, 504, 522, 531].includes(code) || rainMm >= 7.6) return 'HIGH'; // heavy rain
  if ([501, 511, 521].includes(code) || rainMm >= 2.5) return 'MEDIUM';      // moderate rain
  if (code === 781 || code === 771) return 'HIGH';                           // tornado / squalls
  if ([741, 701, 721].includes(code)) return 'MEDIUM';                       // fog / mist / haze
  if ((code >= 300 && code < 400) || code === 500 || code === 520) return 'LOW'; // drizzle / light rain
  return 'NONE';
}

export async function getCurrentWeather(lat: number, lng: number, location: string): Promise<WeatherReport | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn('OPENWEATHER_API_KEY not set — skipping live weather');
    return null;
  }

  try {
    const url = `${OPENWEATHER_URL}?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      console.warn(`OpenWeatherMap returned HTTP ${response.status}`);
      return null;
    }

    const body = (await response.json()) as any;
    const weather = body.weather?.[0];
    if (!weather) return null;

    const rainMm = body.rain?.['1h'] || 0;
    return {
      condition: weather.main,
      description: weather.description,
      severity: severityFromCode(weather.id, rainMm),
      rainMmLastHour: rainMm,
      location,
    };
  } catch (err) {
    console.warn('OpenWeatherMap request failed:', (err as Error).message);
    return null;
  }
}

// Checks weather at every point given and returns the most severe reading
export async function getWorstWeather(
  points: Array<{ lat: number; lng: number; location: string }>
): Promise<WeatherReport | null> {
  const reports = (await Promise.all(points.map((p) => getCurrentWeather(p.lat, p.lng, p.location))))
    .filter((r): r is WeatherReport => r !== null);
  if (reports.length === 0) return null;
  return reports.reduce((worst, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[worst.severity] ? r : worst));
}
