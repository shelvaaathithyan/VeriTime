export interface EvidenceInput {
  arrivalTime: string;       // "08:18"
  scheduledTime: string;     // "08:00"
  explanation: string;       // "TRANSPORT_DELAY"
  transportDelayMinutes: number;
  weatherCondition: string;  // "Heavy Rain", "Clear", etc.
  weatherSeverity: string;   // "HIGH", "MEDIUM", "LOW", "NONE"
  studentType: string;       // "Day Scholar" | "Hostel"
  historicalLateCount: number;
}

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

export function runEvidenceEngine(input: EvidenceInput): EvidenceResult {
  const {
    arrivalTime,
    scheduledTime,
    explanation,
    transportDelayMinutes,
    weatherCondition,
    weatherSeverity,
    studentType,
    historicalLateCount,
  } = input;

  const lateMinutes =
    parseTimeToMinutes(arrivalTime) - parseTimeToMinutes(scheduledTime);
  const evidence: EvidenceItem[] = [];

  // Weather evidence
  const hasHeavyWeather =
    weatherCondition.toLowerCase().includes('rain') ||
    weatherCondition.toLowerCase().includes('storm') ||
    weatherSeverity === 'HIGH';

  if (hasHeavyWeather) {
    evidence.push({
      type: 'WEATHER',
      detail: `${weatherCondition} reported during the commute window`,
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

  // TRANSPORT_DELAY explanations
  if (explanation === 'TRANSPORT_DELAY') {
    if (transportDelayMinutes >= lateMinutes - 5 && transportDelayMinutes > 0) {
      return {
        status: 'SUPPORTED',
        reasonSummary:
          'Available evidence supports the student\'s explanation. The recorded transport delay is consistent with the reported arrival time.',
        evidence,
        transportDelay: transportDelayMinutes,
        weatherCondition,
      };
    }
    if (transportDelayMinutes > 0 && transportDelayMinutes < lateMinutes - 5) {
      return {
        status: 'PARTIALLY_SUPPORTED',
        reasonSummary:
          'A transport delay is recorded, but it accounts for only part of the total delay. The explanation is partially supported by available evidence.',
        evidence,
        transportDelay: transportDelayMinutes,
        weatherCondition,
      };
    }
    if (transportDelayMinutes === 0 && !hasHeavyWeather) {
      return {
        status: 'INCONSISTENT',
        reasonSummary:
          'No transport delay or weather event is recorded for this date and time window. Available context does not corroborate the stated explanation.',
        evidence,
        transportDelay: 0,
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
        transportDelay: 0,
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
