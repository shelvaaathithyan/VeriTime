// Central API client for VeriTime frontend
// All backend requests go through this service

// Empty by default: requests go to /api on the same origin and the Vite dev server
// proxies them to the backend (works from phones on the local network too).
const BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// Session token from login. Kept in localStorage so a refresh keeps the user signed in.
const TOKEN_KEY = 'veritime.token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable (private mode) — session lasts until refresh */ }
}

// Called when the server rejects the session, so the app can return to the login page
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}/api${endpoint}`;
  const token = getToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && token && !endpoint.startsWith('/auth/login')) {
    setToken(null);
    onUnauthorized?.();
  }

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

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: import('../types').AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: import('../types').AuthUser }>('/auth/me'),
};

// Logged-in student's own records
export const meApi = {
  lateCheckins: () => request<import('../types').MyLateCheckinsResponse>('/me/late-checkins'),
};

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

  // Spoken (audioBase64) or typed (text) explanation, transcribed and analysed on the server
  submitStatement: (data: {
    checkinId: string;
    audioBase64?: string;
    mimeType?: string;
    text?: string;
  }) =>
    request<{
      success: boolean;
      explanationId: string;
      reason: string;
      transcript: string;
      summary: string;
      verificationStatus: string;
      verificationSummary: string;
      evidence: import('../types').EvidenceItem[];
    }>('/explanations/statement', {
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
