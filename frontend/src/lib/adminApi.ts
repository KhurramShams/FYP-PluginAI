import axios, { AxiosError, AxiosResponse } from 'axios';

const adminApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── REQUEST: attach Admin JWT token ──────────────────────────────────────────
adminApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── RESPONSE: global 401 redirect ────────────────────────────────────────────
adminApi.interceptors.response.use(
  (res: AxiosResponse) => res,
  (error: AxiosError) => {
    if ((error.response?.status === 401 || error.response?.status === 403) && typeof window !== 'undefined') {
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_user_id');
      localStorage.removeItem('admin_user_email');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

export default adminApi;
