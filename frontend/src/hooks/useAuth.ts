'use client';
import { useEffect, useState } from 'react';
import { getSession, isAuthenticated, AuthUser } from '@/lib/authService';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getSession());
    setReady(true);
  }, []);

  return { user, ready, isLoggedIn: !!user };
}
