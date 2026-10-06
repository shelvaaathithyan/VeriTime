import { CommuteEstimate } from './commuteService';
import { StatementAnalysis } from './speechService';

// Commute thresholds (typical drive time, no traffic) used for first-class lateness
export const SHORT_COMMUTE_MINUTES = 15;
export const LONG_COMMUTE_MINUTES = 60;
// Extra traffic below this is normal variation, not evidence of a traffic jam
export const NOTABLE_TRAFFIC_DELAY_MINUTES = 5;

// Explanations that the home → campus commute can corroborate or contradict
const COMMUTE_EXPLANATIONS = ['TRANSPORT_DELAY', 'TRAFFIC'];

export interface EvidenceInput {
  arrivalTime: string;       // "08:18"
  scheduledTime: string;     // "08:00"
  explanation: string;       // "TRANSPORT_DELAY"
  transportDelayMinutes: number;
  weatherCondition: string;  // "Heavy Rain", "Clear", etc.
  weatherSeverity: string;   // "HIGH", "MEDIUM", "LOW", "NONE"
  studentType: string;       // "Day Scholar" | "Hostel"
  historicalLateCount: number;
  homeArea?: string | null;
  commute?: CommuteEstimate | null; // only present for the first arrival of the day
  weatherLocation?: string | null;   // where the weather reading was taken
  statement?: { transcript: string; analysis: StatementAnalysis } | null; // student's spoken/typed account
  sessionStart?: 'FIRST_CLASS' | 'AFTER_LUNCH' | null; // first class of the morning / after lunch
  gateEntryTime?: string | null;               // "09:19" — latest gate scan before this class (session starts only)
  statementMinutesAfterArrival?: number | null; // how soon after the classroom tap they explained
}

// Reasons about the journey to campus; these can't explain a delay that happened after entering campus
const JOURNEY_EXPLANATIONS = ['TRANSPORT_DELAY', 'TRAFFIC', 'HEAVY_RAIN', 'WEATHER'];

export type VerificationStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'INCONSISTENT'
  | 'UNABLE_TO_VERIFY';

export interface EvidenceItem {
  type: string;
  detail: string;
  weight: 'STRONG' | 'SUPPORTING' | 'PARTIAL' | 'CONTEXTUAL' | 'NONE';
}

export interface EvidenceResult {
  status: VerificationStatus;
  reasonSummary: string;
  evidence: EvidenceItem[];
  transportDelay: number;
  weatherCondition: string;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isAdverseWeather(condition: string, severity: string): boolean {
  return severity === 'HIGH' || severity === 'MEDIUM' || /storm|thunder|heavy/i.test(condition);
}

export function runEvidenceEngine(input: EvidenceInput): EvidenceResult {
  let result = applyGateEvidence(input);
  if (input.statement) result = applyStatementEvidence(result, input);
  if (input.statementMinutesAfterArrival != null) {
    result.evidence.push({
      type: 'STATEMENT_TIMING',
      detail: `Explanation given ${input.statementMinutesAfterArrival} min after arriving in class`,
      weight: 'CONTEXTUAL',
    });
  }
  return result;
}

// Uses the gate tap to separate the journey to campus from time spent on campus
function applyGateEvidence(input: EvidenceInput): EvidenceResult {
  const { gateEntryTime, scheduledTime, arrivalTime, explanation, sessionStart } = input;

  // Class between periods: the student was already on campus, so the gate scan isn't relevant
  if (!sessionStart) return runContextRules(input);

  if (!gateEntryTime) {
    const result = runContextRules(input);
    result.evidence.push({
      type: 'GATE_ENTRY',
      detail: `No gate scan recorded before this ${sessionStart === 'AFTER_LUNCH' ? 'after-lunch' : 'first'} class`,
      weight: 'CONTEXTUAL',
    });
    return result;
  }

  const gateMinutes = parseTimeToMinutes(gateEntryTime);
  const classStart = parseTimeToMinutes(scheduledTime);
  const onCampusMinutes = parseTimeToMinutes(arrivalTime) - gateMinutes;

  // Entered campus before class began: the lateness happened on campus
  if (gateMinutes <= classStart) {
    const gateItem: EvidenceItem = {
      type: 'GATE_ENTRY',
      detail: `Entered campus at ${gateEntryTime}, before class began at ${scheduledTime}, then took ${onCampusMinutes} min to reach class`,
      weight: 'NONE',
    };
    if (JOURNEY_EXPLANATIONS.includes(explanation)) {
      const result = runContextRules({ ...input, commute: null });
      return {
        ...result,
        status: 'INCONSISTENT',
        reasonSummary: `The student entered campus at ${gateEntryTime}, before class started at ${scheduledTime}. The delay happened on campus, so the journey (transport, traffic or weather) does not explain it.`,
        evidence: [gateItem, ...result.evidence.filter((e) => e.type !== 'COMMUTE' && e.type !== 'TRAFFIC')],
      };
    }
    const result = runContextRules({ ...input, commute: null });
    return { ...result, evidence: [gateItem, ...result.evidence] };
  }

  // Entered campus after class began: judge the journey only on the time up to the gate
  const result = runContextRules({ ...input, arrivalTime: gateEntryTime });
  const gateLate = gateMinutes - classStart;
  result.evidence.unshift({
    type: 'GATE_ENTRY',
    detail: `Entered campus at ${gateEntryTime} (${gateLate} min after class began), reached class ${onCampusMinutes} min later`,
    weight: 'CONTEXTUAL',
  });
  return result;
}

// Cross-checks what the student said against the recorded context
function applyStatementEvidence(result: EvidenceResult, input: EvidenceInput): EvidenceResult {
  const { analysis } = input.statement!;
  const { commute, homeArea, weatherCondition, weatherSeverity, weatherLocation } = input;
  const items: EvidenceItem[] = [];

  items.push({
    type: 'STATEMENT',
    detail: `Student's account: ${analysis.summary}`,
    weight: 'CONTEXTUAL',
  });

  if (analysis.mentionsWeather) {
    const adverse = isAdverseWeather(weatherCondition, weatherSeverity);
    const where = !weatherLocation ? '' : weatherLocation === 'Campus' ? ' on campus' : ` in ${weatherLocation}`;
    items.push({
      type: 'STATEMENT_CHECK',
      detail: adverse
        ? `Mentions weather — ${weatherCondition} (${weatherSeverity.toLowerCase()} severity) was recorded${where}`
        : `Mentions weather, but no adverse weather was recorded${where} at check-in`,
      weight: adverse ? 'SUPPORTING' : 'NONE',
    });
  }

  if (analysis.mentionsTraffic && commute) {
    const heavyTraffic = commute.trafficDelayMinutes >= NOTABLE_TRAFFIC_DELAY_MINUTES;
    const supported = heavyTraffic || commute.typicalMinutes >= LONG_COMMUTE_MINUTES;
    items.push({
      type: 'STATEMENT_CHECK',
      detail: heavyTraffic
        ? `Mentions traffic — Google Maps showed ${commute.trafficDelayMinutes} min of extra traffic on their route`
        : supported
          ? `Mentions traffic / long commute — consistent with a ${commute.typicalMinutes} min commute`
          : `Mentions traffic, but their route showed normal traffic and is only ${commute.typicalMinutes} min long`,
      weight: supported ? 'SUPPORTING' : 'NONE',
    });
  }

  if (analysis.originMatchesHome !== 'NOT_MENTIONED' && analysis.mentionedOrigin) {
    const matches = analysis.originMatchesHome === 'MATCH';
    items.push({
      type: 'STATEMENT_CHECK',
      detail: matches
        ? `Says they travelled from ${analysis.mentionedOrigin}, matching their registered home area`
        : `Says they travelled from ${analysis.mentionedOrigin}, but their registered home area is ${homeArea || 'unknown'}`,
      weight: matches ? 'SUPPORTING' : 'NONE',
    });
  }

  let { status, reasonSummary } = result;
  if (analysis.originMatchesHome === 'MISMATCH' && status === 'SUPPORTED') {
    status = 'PARTIALLY_SUPPORTED';
    reasonSummary += ' However, the place the student says they travelled from differs from their registered home area, so the commute evidence may not apply.';
  }

  return { ...result, status, reasonSummary, evidence: [...items, ...result.evidence] };
}

function runContextRules(input: EvidenceInput): EvidenceResult {
  const {
    arrivalTime,
    scheduledTime,
    explanation,
    transportDelayMinutes,
    weatherCondition,
    weatherSeverity,
    studentType,
    historicalLateCount,
    homeArea,
    commute,
  } = input;

  const lateMinutes =
    parseTimeToMinutes(arrivalTime) - parseTimeToMinutes(scheduledTime);
  const evidence: EvidenceItem[] = [];

  // Weather evidence
  const hasHeavyWeather = isAdverseWeather(weatherCondition, weatherSeverity);

  if (hasHeavyWeather) {
    evidence.push({
      type: 'WEATHER',
      detail: `${weatherCondition} reported during the commute window${input.weatherLocation ? ` (${input.weatherLocation})` : ''}`,
      weight: 'SUPPORTING',
    });
  }

  // Transport evidence
  if (transportDelayMinutes > 0) {
    evidence.push({
      type: 'TRANSPORT',
      detail: `${transportDelayMinutes} minute delay recorded on transport route`,
      weight: transportDelayMinutes >= lateMinutes - 5 ? 'STRONG' : 'PARTIAL',
    });
  }

  // Commute evidence — only measured when this is the first class of the day
  const isShortCommute = !!commute && commute.typicalMinutes < SHORT_COMMUTE_MINUTES;
  const isLongCommute = !!commute && commute.typicalMinutes >= LONG_COMMUTE_MINUTES;
  const trafficDelayMinutes = commute?.trafficDelayMinutes || 0;
  // Live traffic on the student's route counts as a transport delay
  const effectiveDelayMinutes = Math.max(transportDelayMinutes, trafficDelayMinutes);

  if (commute) {
    const where = homeArea ? `Lives in ${homeArea}, ` : 'Lives ';
    const source = commute.source === 'GOOGLE_ROUTES' ? 'Google Maps' : 'estimated';
    evidence.push({
      type: 'COMMUTE',
      detail: `${where}${commute.distanceKm} km from campus — ${commute.typicalMinutes} min typical commute (${source})`,
      weight: isLongCommute ? 'SUPPORTING' : isShortCommute ? 'NONE' : 'CONTEXTUAL',
    });
  }

  if (trafficDelayMinutes > 0) {
    evidence.push({
      type: 'TRAFFIC',
      detail: `${trafficDelayMinutes} min of extra traffic on the student's route at check-in time (${commute!.durationMinutes} min vs ${commute!.typicalMinutes} min typical)`,
      weight: trafficDelayMinutes >= lateMinutes - 5 ? 'STRONG' : 'PARTIAL',
    });
  }

  // Student type context
  if (studentType === 'Day Scholar') {
    evidence.push({
      type: 'STUDENT_TYPE',
      detail: 'Day Scholar — commutes from outside campus',
      weight: 'CONTEXTUAL',
    });
  }

  // Historical context — contextual only, never negative judgement
  if (historicalLateCount > 0) {
    evidence.push({
      type: 'HISTORICAL',
      detail: `${historicalLateCount} previous late arrival(s) on record — context only`,
      weight: 'CONTEXTUAL',
    });
  }

  // --- Decision rules ---

  // Commute-based rules for the first class of the day
  if (commute && COMMUTE_EXPLANATIONS.includes(explanation)) {
    if (isShortCommute && !hasHeavyWeather && transportDelayMinutes === 0) {
      return {
        status: 'INCONSISTENT',
        reasonSummary:
          `The student lives about ${commute.typicalMinutes} minutes from campus. A short commute does not account for a ${lateMinutes}-minute late arrival, and no weather or transport disruption is recorded.`,
        evidence,
        transportDelay: effectiveDelayMinutes,
        weatherCondition,
      };
    }
    if (isLongCommute) {
      if (lateMinutes <= commute.typicalMinutes) {
        return {
          status: 'SUPPORTED',
          reasonSummary:
            `Long-distance commute: the student travels ${commute.distanceKm} km (about ${commute.typicalMinutes} minutes) for the first class. A ${lateMinutes}-minute delay is within the range expected on a commute of this length.`,
          evidence,
          transportDelay: effectiveDelayMinutes,
          weatherCondition,
        };
      }
      return {
        status: 'PARTIALLY_SUPPORTED',
        reasonSummary:
          `The student has a long commute (about ${commute.typicalMinutes} minutes), but the ${lateMinutes}-minute delay is longer than the commute itself. The long journey only partly explains the late arrival.`,
        evidence,
        transportDelay: effectiveDelayMinutes,
        weatherCondition,
      };
    }
  }

  // TRANSPORT_DELAY / TRAFFIC explanations (recorded transport delay or live traffic)
  if (COMMUTE_EXPLANATIONS.includes(explanation)) {
    if (effectiveDelayMinutes >= lateMinutes - 5 && effectiveDelayMinutes > 0) {
      return {
        status: 'SUPPORTED',
        reasonSummary:
          'Available evidence supports the student\'s explanation. The recorded transport delay is consistent with the reported arrival time.',
        evidence,
        transportDelay: effectiveDelayMinutes,
        weatherCondition,
      };
    }
    if (effectiveDelayMinutes > 0 && effectiveDelayMinutes < lateMinutes - 5) {
      return {
        status: 'PARTIALLY_SUPPORTED',
        reasonSummary:
          'A transport delay is recorded, but it accounts for only part of the total delay. The explanation is partially supported by available evidence.',
        evidence,
        transportDelay: effectiveDelayMinutes,
        weatherCondition,
      };
    }
    if (effectiveDelayMinutes === 0 && !hasHeavyWeather) {
      return {
        status: 'INCONSISTENT',
        reasonSummary:
          'No transport delay or weather event is recorded for this date and time window. Available context does not corroborate the stated explanation.',
        evidence,
        transportDelay: effectiveDelayMinutes,
        weatherCondition,
      };
    }
    // Transport is 0 but weather supports
    if (hasHeavyWeather) {
      return {
        status: 'PARTIALLY_SUPPORTED',
        reasonSummary:
          'No transport delay record found, but adverse weather conditions were present. Partial contextual support exists.',
        evidence,
        transportDelay: effectiveDelayMinutes,
        weatherCondition,
      };
    }
  }

  // WEATHER explanation
  if (explanation === 'HEAVY_RAIN' || explanation === 'WEATHER') {
    if (hasHeavyWeather) {
      return {
        status: 'SUPPORTED',
        reasonSummary:
          'Weather records confirm adverse conditions during the commute window, consistent with the student\'s explanation.',
        evidence,
        transportDelay: transportDelayMinutes,
        weatherCondition,
      };
    }
    return {
      status: 'INCONSISTENT',
      reasonSummary:
          'No adverse weather conditions are recorded for this time window. Available context does not corroborate the weather-related explanation.',
      evidence,
      transportDelay: transportDelayMinutes,
      weatherCondition,
    };
  }

  // MEDICAL / EMERGENCY — always UNABLE_TO_VERIFY without documentation
  if (explanation === 'MEDICAL_EMERGENCY' || explanation === 'MEDICAL') {
    return {
      status: 'UNABLE_TO_VERIFY',
      reasonSummary:
        'Medical or emergency reasons require documentation (e.g., medical certificate) that cannot be assessed automatically. This case is referred to the teacher for review.',
      evidence,
      transportDelay: transportDelayMinutes,
      weatherCondition,
    };
  }

  // COLLEGE_ACTIVITY
  if (explanation === 'COLLEGE_ACTIVITY') {
    return {
      status: 'UNABLE_TO_VERIFY',
      reasonSummary:
        'College activity reasons require confirmation from the organising department. Referred to teacher for verification.',
      evidence,
      transportDelay: transportDelayMinutes,
      weatherCondition,
    };
  }

  // HOSTEL_DELAY — special case for hostel students
  if (explanation === 'HOSTEL_DELAY') {
    if (studentType === 'Hostel') {
      return {
        status: 'PARTIALLY_SUPPORTED',
        reasonSummary:
          'Student is a hostel resident. Hostel-related delays are plausible but require hostel warden confirmation for full support.',
        evidence,
        transportDelay: transportDelayMinutes,
        weatherCondition,
      };
    }
    return {
      status: 'INCONSISTENT',
      reasonSummary:
        'Student is not a hostel resident. A hostel-related delay explanation is inconsistent with registered student type.',
      evidence,
      transportDelay: transportDelayMinutes,
      weatherCondition,
    };
  }

  // PERSONAL / OTHER — default UNABLE_TO_VERIFY
  return {
    status: 'UNABLE_TO_VERIFY',
    reasonSummary:
      'Insufficient external evidence is available to independently assess this explanation. Referred to teacher for review.',
    evidence,
    transportDelay: transportDelayMinutes,
    weatherCondition,
  };
}
