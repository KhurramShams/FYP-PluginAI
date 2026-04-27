import adminApi from './adminApi';
import { LoginPayload, VerifiedUser, AuthUser, extractErrorMessage } from './authService';

export function saveAdminSession(token: string, userId: string, email: string) {
  localStorage.setItem('admin_access_token', token);
  localStorage.setItem('admin_user_id', userId);
  localStorage.setItem('admin_user_email', email);
}

export function clearAdminSession() {
  localStorage.removeItem('admin_access_token');
  localStorage.removeItem('admin_user_id');
  localStorage.removeItem('admin_user_email');
}

export function getAdminSession(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const user_id = localStorage.getItem('admin_user_id');
  const email   = localStorage.getItem('admin_user_email');
  if (!user_id || !email) return null;
  return { user_id, email };
}

export function isAdminAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('admin_access_token');
}

export interface AdminLoginPayload extends LoginPayload {
  admin_api_key: string;
}

/** POST /auth/admin/sign_in — returns { status, access_token, user_id, message, expires_in } */
export async function loginAdminUser(payload: AdminLoginPayload) {
  const res = await adminApi.post('/auth/admin/sign_in', payload);
  return res.data as { 
    status: string; 
    access_token?: string; 
    user_id?: string; 
    message?: string; 
    expires_in?: number;
  };
}

/** POST /auth/2fa/verify */
export async function verifyAdminOTP(userId: string, otp: string) {
  const res = await adminApi.post('/auth/2fa/verify', { user_id: userId, otp });
  return res.data as { status: string; message: string; access_token?: string };
}

/**
 * GET /auth/google/verify?access_token=...
 * Verifies the JWT and returns full user profile from DimUsers.
 */
export async function verifyAdminToken(accessToken: string): Promise<VerifiedUser> {
  const res = await adminApi.get('/auth/google/verify', {
    params: { access_token: accessToken },
  });
  return res.data.user as VerifiedUser;
}

/** POST /auth/sign_out */
export async function logoutAdminUser(userId: string, email: string) {
  await adminApi.post(`/auth/sign_out?user_id=${userId}&email=${encodeURIComponent(email)}`);
  clearAdminSession();
}
