'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { AppDataProvider } from '@/components/AppDataProvider';
import { useAuth } from '@/hooks/useAuth';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoggedIn, ready } = useAuth();

  useEffect(() => {
    if (ready && !isLoggedIn) {
      router.replace('/login');
    }
  }, [ready, isLoggedIn, router]);

  // Shield DOM painting until backend authorization concludes affirmatively
  if (!ready || !isLoggedIn) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: 'rgba(255,255,255,0.4)' }}>
        Authenticating constraints...
      </div>
    );
  }

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppDataProvider>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
          <Sidebar />
          <main style={{ flex: 1, overflowY: 'auto', padding: '36px 40px' }}>
            {children}
          </main>
        </div>
      </AppDataProvider>
    </AuthGuard>
  );
}
