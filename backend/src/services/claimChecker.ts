// backend/src/services/claimChecker.ts
// Checks each claim in a student's late-arrival reason against recorded data and gives a
// final verdict (true / false / unverified) and attendance outcome, with the reason why.

import { CommuteEstimate } from './commuteService';
import { StatementAnalysis } from './speechService';
import { LONG_COMMUTE_MINUTES, SHORT_COMMUTE_MINUTES, NOTABLE_TRAFFIC_DELAY_MINUTES } from './evidenceEngine';

export type ClaimVerdict = 'TRUE' | 'FALSE' | 'UNVERIFIABLE';
export type OverallVerdict = 'TRUE' | 'FALSE' | 'UNVERIFIED' | 'NO_STATEMENT' | 'REPEATED_LATENESS';

// Reasons the student is let in for, with attendance verified later by the teacher
export const VERIFY_LATER_REASONS: Record<string, string> = {
  MEDICAL_EMERGENCY: 'A medical issue caused the delay',
  FAMILY_EMERGENCY: 'A family emergency caused the delay',
  PERSONAL: 'A personal issue caused the delay',
  TEACHER_MEETING: 'Was meeting a teacher',
  PLACEMENT: 'A placement activity ran late',
  COLLEGE_ACTIVITY: 'A college activity caused the delay',
};
export type Attendance = 'GRANTED' | 'DENIED' | 'PENDING_REVIEW';

export interface ClaimCheck {
  claim: string;     // what the student said, e.g. "Heavy rain caused the delay"
  verdict: ClaimVerdict;
  reason: string;    // why it is true / false / can't be checked
  source: string;    // where the evidence came from
}

// A data check that ran, shown whether or not the student mentioned it
export interface DataCheck {
  label: string;     // e.g. "Live traffic, Erode → PSG Tech"
  result: string;    // e.g. "118 min now vs 114 min usual (+4 min) — normal"
  source: string;
}

export interface VerdictResult {
  verdict: OverallVerdict;
  attendance: Attendance;
  summary: string;
  claims: ClaimCheck[];
  checks: DataCheck[];
}

export interface ClaimInput {
  reason: string;                       // reason category, e.g. HEAVY_RAIN
  analysis?: StatementAnalysis | null;  // from the spoken/typed statement, if any
  arrivalTime: string;                  // "09:27" — class door scan
  scheduledTime: string;                // "09:20"
  sessionStart?: string | null;         // FIRST_CLASS / AFTER_LUNCH / null
  gateEntryTime?: string | null;        // "09:15"
  weather?: { condition: string; severity: string; description: string | null; location: string | null } | null;
  weatherReadings?: Array<{ condition: string; description: string; severity: string; location: string; rainMmLastHour?: number }>;
  commute?: CommuteEstimate | null;
  homeArea?: string | null;
  studentType: string;
  transportDelayMinutes: number;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isAdverse(condition: string, severity: string): boolean {
  return severity === 'HIGH' || severity === 'MEDIUM' || /storm|thunder|heavy/i.test(condition);
}

function where(location: string | null): string {
  if (!location) return '';
  return location === 'Campus' ? ' on campus' : ` in ${location}`;
}

export function checkClaims(input: ClaimInput): VerdictResult {
  const { reason, analysis, arrivalTime, scheduledTime, sessionStart, gateEntryTime, weather, commute, homeArea, studentType } = input;
  const claims: ClaimCheck[] = [];

  const claimsWeather = !!analysis?.mentionsWeather || reason === 'HEAVY_RAIN' || reason === 'WEATHER';
  // From a statement, traffic (congestion) and a long journey (distance) are separate claims
  const claimsTraffic = analysis ? analysis.mentionsTraffic : reason === 'TRAFFIC';
  const claimsLongCommute = !!analysis?.mentionsLongCommute;
  const claimsTransport = !!analysis?.mentionsTransport || reason === 'TRANSPORT_DELAY';
  const journeyClaim = claimsWeather || claimsTraffic || claimsLongCommute || claimsTransport;

  // 1. Did the delay happen before reaching campus? (gate + door scans, session-start classes only)
  if (journeyClaim && sessionStart && gateEntryTime && toMinutes(gateEntryTime) <= toMinutes(scheduledTime)) {
    const early = toMinutes(scheduledTime) - toMinutes(gateEntryTime);
    claims.push({
      claim: 'The delay happened on the way to college',
      verdict: 'FALSE',
      reason: `You scanned in at the gate at ${gateEntryTime}, ${early} min before class started at ${scheduledTime}, and reached the class door at ${arrivalTime}. The delay happened after you were already on campus.`,
      source: 'Gate and class door NFC scans',
    });
  }

  // 2. Weather
  if (claimsWeather) {
    if (!weather) {
      claims.push({
        claim: 'Bad weather caused the delay',
        verdict: 'UNVERIFIABLE',
        reason: 'No weather reading was available for this arrival.',
        source: 'OpenWeatherMap',
      });
    } else if (isAdverse(weather.condition, weather.severity)) {
      claims.push({
        claim: 'Bad weather caused the delay',
        verdict: 'TRUE',
        reason: `OpenWeatherMap recorded ${weather.description || weather.condition}${where(weather.location)} at ${arrivalTime}.`,
        source: 'OpenWeatherMap',
      });
    } else {
      const reason = weather.severity === 'LOW'
        ? `OpenWeatherMap recorded only ${weather.description || 'light rain'}${where(weather.location)} at ${arrivalTime}, which is not enough to cause a delay.`
        : `OpenWeatherMap recorded ${weather.description || weather.condition.toLowerCase()} with no rain${where(weather.location)} at ${arrivalTime}.`;
      claims.push({
        claim: 'Bad weather caused the delay',
        verdict: 'FALSE',
        reason,
        source: 'OpenWeatherMap',
      });
    }
  }

  // 3. Traffic — judged only on live traffic on the student's route, whatever the distance
  const route = `${homeArea || 'home'} → PSG Tech`;
  if (claimsTraffic) {
    if (!commute) {
      claims.push({
        claim: 'Heavy traffic caused the delay',
        verdict: 'UNVERIFIABLE',
        reason: 'Traffic is only measured for the first class of the day, and only when a home location is registered.',
        source: 'Google Maps',
      });
    } else if (commute.trafficDelayMinutes >= NOTABLE_TRAFFIC_DELAY_MINUTES) {
      claims.push({
        claim: 'Heavy traffic caused the delay',
        verdict: 'TRUE',
        reason: `Google Maps showed ${commute.trafficDelayMinutes} min of extra traffic on ${route} (${commute.durationMinutes} min instead of the usual ${commute.typicalMinutes} min).`,
        source: 'Google Maps',
      });
    } else {
      claims.push({
        claim: 'Heavy traffic caused the delay',
        verdict: 'FALSE',
        reason: `Google Maps showed normal traffic on ${route}: ${commute.durationMinutes} min against the usual ${commute.typicalMinutes} min${commute.trafficDelayMinutes > 0 ? ` (only +${commute.trafficDelayMinutes} min)` : ''}.`,
        source: 'Google Maps',
      });
    }
  }

  // 3b. Long journey — the student says they live far away
  if (claimsLongCommute) {
    if (!commute) {
      claims.push({
        claim: 'A long journey from home caused the delay',
        verdict: 'UNVERIFIABLE',
        reason: 'The commute is only measured for the first class of the day, and only when a home location is registered.',
        source: 'Google Maps',
      });
    } else {
      const long = commute.typicalMinutes >= LONG_COMMUTE_MINUTES;
      claims.push({
        claim: 'A long journey from home caused the delay',
        verdict: long ? 'TRUE' : 'FALSE',
        reason: long
          ? `Your journey from ${homeArea || 'home'} is ${commute.distanceKm} km (about ${commute.typicalMinutes} min). Delays are expected on a commute this long.`
          : `Your journey from ${homeArea || 'home'} is only ${commute.distanceKm} km (about ${commute.typicalMinutes} min)${commute.typicalMinutes < SHORT_COMMUTE_MINUTES ? ', which is very short' : ', which is not a long commute'}.`,
        source: 'Google Maps',
      });
    }
  }

  // 4. Public transport (bus/train) — only checkable if a delay was recorded
  if (claimsTransport && !claimsTraffic) {
    claims.push(input.transportDelayMinutes > 0
      ? {
          claim: 'Public transport was delayed',
          verdict: 'TRUE',
          reason: `A ${input.transportDelayMinutes} min public transport delay was recorded for today.`,
          source: 'Transport delay records',
        }
      : {
          claim: 'Public transport was delayed',
          verdict: 'UNVERIFIABLE',
          reason: 'There is no public transport delay data to check this against.',
          source: 'Transport delay records',
        });
  }

  // 5. Where they travelled from — only a named place can be compared ("home" says nothing about where)
  const GENERIC_PLACES = ['home', 'my home', 'house', 'my house', 'hostel', 'room', 'my place'];
  const namedOrigin = analysis?.mentionedOrigin && !GENERIC_PLACES.includes(analysis.mentionedOrigin.trim().toLowerCase());
  if (namedOrigin && analysis!.originMatchesHome !== 'NOT_MENTIONED') {
    const matches = analysis.originMatchesHome === 'MATCH';
    claims.push({
      claim: `Travelled from ${analysis.mentionedOrigin}`,
      verdict: matches ? 'TRUE' : 'FALSE',
      reason: matches
        ? `This matches your registered home area (${homeArea || 'unknown'}).`
        : `Your registered home area is ${homeArea || 'unknown'}, not ${analysis.mentionedOrigin}.`,
      source: 'Student records',
    });
  }

  // 6. Reasons the teacher verifies later (family emergency, personal, meeting a teacher, placements…)
  if (VERIFY_LATER_REASONS[reason]) {
    claims.push({
      claim: VERIFY_LATER_REASONS[reason],
      verdict: 'UNVERIFIABLE',
      reason: reason === 'MEDICAL_EMERGENCY'
        ? 'You may enter the class. Your teacher will verify this later (a medical certificate may be needed).'
        : 'You may enter the class. Your teacher will verify this later.',
      source: 'Teacher verification',
    });
  } else if (!journeyClaim) {
    if (reason === 'HOSTEL_DELAY' && studentType !== 'Hostel') {
      claims.push({
        claim: 'A hostel issue caused the delay',
        verdict: 'FALSE',
        reason: `You are registered as a ${studentType}, not a hostel resident.`,
        source: 'Student records',
      });
    } else {
      claims.push({
        claim: reason === 'HOSTEL_DELAY' ? 'A hostel issue caused the delay' : 'Other reason',
        verdict: 'UNVERIFIABLE',
        reason: 'There is no data that can confirm or contradict this. Your teacher will verify it later.',
        source: 'Teacher verification',
      });
    }
  }

  // Every check that ran, shown even if the student didn't mention it
  const checks: DataCheck[] = [];
  if (commute) {
    const traffic = commute.trafficDelayMinutes >= NOTABLE_TRAFFIC_DELAY_MINUTES ? 'heavy traffic' : 'normal traffic';
    checks.push({
      label: `Live traffic, ${route}`,
      result: `${commute.durationMinutes} min now vs ${commute.typicalMinutes} min usual (+${commute.trafficDelayMinutes} min) — ${traffic}`,
      source: commute.source === 'GOOGLE_ROUTES' ? 'Google Maps' : 'Estimate (Google Maps unavailable)',
    });
    checks.push({
      label: 'Distance from home',
      result: `${commute.distanceKm} km — ${commute.typicalMinutes >= LONG_COMMUTE_MINUTES ? 'long commute' : commute.typicalMinutes < SHORT_COMMUTE_MINUTES ? 'very short commute' : 'medium commute'}`,
      source: commute.source === 'GOOGLE_ROUTES' ? 'Google Maps' : 'Estimate',
    });
  } else {
    checks.push({ label: 'Live traffic', result: 'Not measured (only for the first class of the day)', source: 'Google Maps' });
  }
  const readings = input.weatherReadings?.length ? input.weatherReadings : weather ? [{ ...weather, description: weather.description || weather.condition, location: weather.location || 'Campus' }] : [];
  if (readings.length) {
    for (const r of readings) {
      checks.push({
        label: `Weather ${r.location === 'Campus' ? 'on campus' : `in ${r.location}`}`,
        result: `${r.description}${r.severity === 'NONE' ? ' — no rain' : ` — ${r.severity.toLowerCase()} severity`}`,
        source: 'OpenWeatherMap',
      });
    }
  } else {
    checks.push({ label: 'Weather', result: 'No reading available', source: 'OpenWeatherMap' });
  }
  checks.push({
    label: 'Scans',
    result: `${sessionStart ? `Gate ${gateEntryTime || 'not scanned'} · ` : ''}Door ${arrivalTime} · class started ${scheduledTime}`,
    source: 'NFC scans',
  });

  const firstFalse = claims.find((c) => c.verdict === 'FALSE');
  const firstTrue = claims.find((c) => c.verdict === 'TRUE');

  // Family emergency, personal issues, meeting a teacher, placements…: always let in, teacher verifies later.
  // Anything that didn't match is still listed so the teacher sees it.
  if (VERIFY_LATER_REASONS[reason]) {
    return {
      verdict: 'UNVERIFIED',
      attendance: 'PENDING_REVIEW',
      summary: 'You may enter the class. Your attendance will be verified later by your teacher.'
        + (firstFalse ? ' Note: part of what you said did not match the recorded data, and your teacher will see this.' : ''),
      claims,
      checks,
    };
  }
  if (firstFalse) {
    return {
      verdict: 'FALSE',
      attendance: 'DENIED',
      summary: `Your reason does not match the evidence. ${firstFalse.reason}`,
      claims,
      checks,
    };
  }
  if (firstTrue) {
    return {
      verdict: 'TRUE',
      attendance: 'GRANTED',
      summary: `Your reason matches the evidence. ${firstTrue.reason}`,
      claims,
      checks,
    };
  }
  return {
    verdict: 'UNVERIFIED',
    attendance: 'PENDING_REVIEW',
    summary: 'You may enter the class. This reason cannot be checked automatically, so your attendance will be verified later by your teacher.',
    claims,
    checks,
  };
}
