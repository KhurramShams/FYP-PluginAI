'use client';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function PublicRouteGuard() {
  const { isLoggedIn, ready } = useAuth();
  
  useEffect(() => {
    if (ready && isLoggedIn) {
      // Replace history so they can't spam back button and get trapped in a redirect loop
      window.location.replace('/app/dashboard');
    }
  }, [ready, isLoggedIn]);

  return null;
}
