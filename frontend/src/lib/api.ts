import axios, { AxiosError, AxiosResponse } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── REQUEST: attach JWT token ─────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── RESPONSE: global 401 redirect ────────────────────────────────────────────
api.interceptors.response.use(
  (res: AxiosResponse) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_email');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
