// Shared TypeScript types for VeriTime frontend

export type VerificationStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'INCONSISTENT'
  | 'UNABLE_TO_VERIFY'
  | 'PENDING';

export type TeacherDecision =
  | 'EXCUSED'
  | 'MARKED_LATE'
  | 'REQUEST_FURTHER_EVIDENCE';

export type ExplanationReason =
  | 'TRANSPORT_DELAY'
  | 'HEAVY_RAIN'
  | 'WEATHER'
  | 'MEDICAL_EMERGENCY'
  | 'COLLEGE_ACTIVITY'
  | 'HOSTEL_DELAY'
  | 'PERSONAL'
  | 'OTHER';

export interface Student {
  id: string;
  name: string;
  department: string;
  student_type: string;
  email?: string;
  nfc_credential_id?: string;
  nfc_status?: string;
}

export interface NfcLookupResponse {
  registered: boolean;
  message?: string;
  student?: {
    id: string;
    name: string;
    department: string;
    studentType: string;
  };
  scheduledTime?: string;
  currentPeriod?: { subject: string; period: number } | null;
  currentTime?: string;
  lateMinutes?: number;
  isLate?: boolean;
}

export interface Checkin {
  id: string;
  student_id: string;
  name: string;
  department: string;
  student_type: string;
  timestamp: string;
  scheduled_time: string;
  late_minutes: number;
  is_late: number;
  location: string;
  reader_id: string;
  card_identifier?: string;
  verification_status?: VerificationStatus;
  schedule_status?: string;
  class_code?: string;
  period?: number;
}

export interface LateArrival {
  id: string;
  checkin_id: string;
  student_id: string;
  name: string;
  department: string;
  student_type: string;
  timestamp: string;
  scheduled_time: string;
  late_minutes: number;
  location: string;
  reason?: string;
  additional_explanation?: string;
  verification_status: VerificationStatus;
  verification_summary?: string;
  teacher_decision?: TeacherDecision;
  class_code?: string;
  period?: number;
}

export interface EvidenceItem {
  type: string;
  detail: string;
  weight: 'STRONG' | 'SUPPORTING' | 'PARTIAL' | 'CONTEXTUAL' | 'NONE';
}

export interface LateArrivalEvidence {
  id: string;
  student: {
    id: string;
    name: string;
    department: string;
    studentType: string;
  };
  checkin: {
    timestamp: string;
    scheduledTime: string;
    lateMinutes: number;
    location: string;
    readerId: string;
  };
  explanation: {
    reason: ExplanationReason;
    additionalExplanation?: string;
    timestamp: string;
  } | null;
  weather: {
    date: string;
    condition: string;
    severity: string;
  } | null;
  transport: {
    date: string;
    route: string;
    delay_minutes: number;
    description: string;
  } | null;
  historicalLateCount: number;
  verificationStatus: VerificationStatus;
  verificationSummary: string;
  evidence: EvidenceItem[];
  teacherDecision: {
    teacher_decision: TeacherDecision;
    timestamp: string;
    notes?: string;
  } | null;
}

export interface DashboardData {
  totalCheckins: number;
  lateArrivals: number;
  supported: number;
  needsReview: number;
  recentCheckins: Checkin[];
  date: string;
  currentStatus?: {
    isLate: boolean;
    reason: string;
    periodNumber?: number;
    subjectCode?: string;
    room?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
  };
}

export interface NfcCredential {
  card_identifier: string;
  status: string;
  registered_at: string;
  name: string;
  student_id: string;
  department: string;
}
