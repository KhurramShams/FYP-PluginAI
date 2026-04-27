import api from './api';

export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  company_name: string | null;
  phone_number: string | null;
  subscription_plan: string | null;
  profile_picture_url: string | null;
  terms_accepted: boolean;
  created_at: string;
  last_login: string | null;
}

export interface UserUpdatePayload {
  full_name?: string;
  company_name?: string;
  phone_number?: string;
  profile_picture_url?: string;
  role?: string;
}

/** GET /user/get?user_id=... — returns full user profile */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const res = await api.get('/user/get', { params: { user_id: userId } });
    const data = res.data?.data;
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  } catch {
    return null;
  }
}

/** POST /user/update/{user_id} — update profile fields */
export async function updateUserProfile(userId: string, payload: UserUpdatePayload) {
  const res = await api.post(`/user/update/${userId}`, payload);
  return res.data as { status: string; message: string };
}

/** POST /user/delete/{user_id} — permanently delete account */
export async function deleteUserAccount(userId: string) {
  const res = await api.post(`/user/delete/${userId}`);
  return res.data as { status: string; message: string };
}

/** POST /user/password_reset/{user_id} — sends reset email via Supabase */
export async function requestPasswordReset(userId: string) {
  const res = await api.post(`/user/password_reset/${userId}`);
  return res.data as { status: string; message: string };
}
