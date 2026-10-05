// Central API client for VeriTime frontend
// All backend requests go through this service

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}/api${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      errorMessage = body.error || errorMessage;
    } catch {
      // ignore parse error
    }
    throw new ApiError(errorMessage, response.status);
  }

  return response.json();
}

// NFC
export const nfcApi = {
  lookup: (cardIdentifier: string) =>
    request<import('../types').NfcLookupResponse>('/nfc/lookup', {
      method: 'POST',
      body: JSON.stringify({ cardIdentifier }),
    }),

  register: (cardIdentifier: string, studentId: string) =>
    request('/nfc/register', {
      method: 'POST',
      body: JSON.stringify({ cardIdentifier, studentId }),
    }),

  getCredentials: () =>
    request<import('../types').NfcCredential[]>('/nfc/credentials'),
};

// Checkins
export const checkinApi = {
  create: (data: {
    cardIdentifier?: string;
    studentId: string;
    timestamp: string;
    readerId?: string;
    location?: string;
  }) =>
    request<{
      success: boolean;
      checkinId: string;
      lateArrivalId: string | null;
      student: { id: string; name: string; department: string };
      arrivalTime: string;
      scheduledTime: string;
      lateMinutes: number;
      isLate: boolean;
      location: string;
      readerId: string;
    }>('/checkins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getToday: () =>
    request<import('../types').Checkin[]>('/checkins'),
};

// Late Arrivals
export const lateArrivalApi = {
  getAll: () =>
    request<import('../types').LateArrival[]>('/late-arrivals'),

  getEvidence: (id: string) =>
    request<import('../types').LateArrivalEvidence>(`/late-arrivals/${id}/evidence`),
};

// Explanations
export const explanationApi = {
  submit: (data: {
    checkinId: string;
    studentId: string;
    reason: string;
    additionalExplanation?: string;
  }) =>
    request<{
      success: boolean;
      explanationId: string;
      verificationStatus: string;
      verificationSummary: string;
      evidence: import('../types').EvidenceItem[];
    }>('/explanations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Teacher Decisions
export const teacherDecisionApi = {
  submit: (data: {
    lateArrivalId: string;
    teacherDecision: string;
    teacherId?: string;
    notes?: string;
  }) =>
    request<{ success: boolean; lateArrivalId: string; teacherDecision: string }>(
      '/teacher-decision',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
};

// Students
export const studentApi = {
  getAll: () =>
    request<import('../types').Student[]>('/students'),

  getById: (id: string) =>
    request<import('../types').Student & {
      history: Array<{
        checkin_id: string;
        timestamp: string;
        scheduled_time: string;
        late_minutes: number;
        is_late: number;
        verification_status?: string;
        reason?: string;
      }>;
      credential: { card_identifier: string; status: string } | null;
    }>(`/students/${id}`),
};

// Dashboard
export const dashboardApi = {
  get: () =>
    request<import('../types').DashboardData>('/dashboard'),
};

export { ApiError };
