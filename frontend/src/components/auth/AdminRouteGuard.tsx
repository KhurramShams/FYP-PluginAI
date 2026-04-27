'use client';
import { useEffect, useState } from 'react';
import { isAdminAuthenticated } from '@/lib/adminAuthService';

export function AdminRouteGuard() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace('/admin/login');
    } else {
      setReady(true);
    }
  }, []);

  return null;
}

export function AdminPublicRouteGuard() {
  useEffect(() => {
    if (isAdminAuthenticated()) {
      window.location.replace('/admin/dashboard');
    }
  }, []);

  return null;
}
