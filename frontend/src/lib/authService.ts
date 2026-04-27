import api from './api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface VerifiedUser {
  user_id: string;
  email: string;
  full_name: string;
  company_name?: string;
  subscription_plan?: string;
  phone_number?: string;
  role?: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  phone_number: string;
  company_name?: string;
  role?: string;
}

export interface AuthUser {
  user_id: string;
  email: string;
}

// ── Safely extract error message from any Axios error ────────────────────────
export function extractErrorMessage(err: any, fallback: string = 'Something went wrong.'): string {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) {
    // FastAPI 422 Pydantic validation: detail is [{type, loc, msg, input}, ...]
    return detail.map((d: any) => (typeof d === 'string' ? d : (typeof d.msg === 'string' ? d.msg : JSON.stringify(d)))).join(' · ');
  }
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail !== null) return JSON.stringify(detail);
  if (typeof err?.message === 'string') return err.message;
  return fallback;
}

// ── Persist session to localStorage ──────────────────────────────────────────
export function saveSession(token: string, userId: string, email: string) {
  localStorage.setItem('access_token', token);
  localStorage.setItem('user_id', userId);
  localStorage.setItem('user_email', email);
}

export function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_email');
  
  // Wipe Zustand Persist Caches
  localStorage.removeItem('plugin-ai-workspace-storage');
}

export function getSession(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const user_id = localStorage.getItem('user_id');
  const email   = localStorage.getItem('user_email');
  if (!user_id || !email) return null;
  return { user_id, email };
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('access_token');
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/** POST /auth/sign_up — returns { status, user_id } */
export async function registerUser(payload: RegisterPayload) {
  const res = await api.post('/auth/sign_up', {
    ...payload,
    full_name: payload.username,  // Backend requires full_name (non-optional in Pydantic)
    role: payload.role ?? 'user',
  });
  return res.data as { status: string; user_id: string; message: string };
}

/** POST /auth/sign_in — returns { status, access_token, user_id, message, expires_in } */
export async function loginUser(payload: LoginPayload) {
  const res = await api.post('/auth/sign_in', payload);
  return res.data as { 
    status: string; 
    access_token?: string; 
    user_id?: string; 
    message?: string; 
    expires_in?: number;
  };
}

/** POST /auth/2fa/verify */
export async function verifyOTP(userId: string, otp: string) {
  const res = await api.post('/auth/2fa/verify', { user_id: userId, otp });
  return res.data as { status: string; message: string; access_token?: string };
}

/**
 * GET /auth/google/verify?access_token=...
 * Verifies the JWT and returns full user profile from DimUsers.
 * Call this immediately after sign_in to get the real user_id.
 */
export async function verifyToken(accessToken: string): Promise<VerifiedUser> {
  const res = await api.get('/auth/google/verify', {
    params: { access_token: accessToken },
  });
  // Response shape: { status, user: { user_id, email, full_name, ... }, access_token }
  return res.data.user as VerifiedUser;
}

/** POST /auth/sign_out */
export async function logoutUser(userId: string, email: string) {
  await api.post(`/auth/sign_out?user_id=${userId}&email=${encodeURIComponent(email)}`);
  clearSession();
}
