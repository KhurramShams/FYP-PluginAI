'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminRouteGuard } from '@/components/auth/AdminRouteGuard';
import { logoutAdminUser, getAdminSession } from '@/lib/adminAuthService';

const NavItem = ({ href, icon, label }: { href: string; icon: string; label: string }) => {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);
  
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px', borderRadius: '8px',
      background: isActive ? 'rgba(124,109,240,0.1)' : 'transparent',
      color: isActive ? '#7c6df0' : 'rgba(255,255,255,0.7)',
      textDecoration: 'none', fontWeight: isActive ? 600 : 500,
      transition: 'all 0.2s', margin: '4px 0'
    }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      {label}
    </Link>
  );
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    const session = getAdminSession();
    if (session) setAdminEmail(session.email);
  }, []);

  const handleLogout = async () => {
    const session = getAdminSession();
    if (session) {
      await logoutAdminUser(session.user_id, session.email);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a', color: '#fff' }}>
      <AdminRouteGuard />
      
      {/* Sidebar */}
      <div style={{
        width: '260px', background: '#111', borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column', padding: '24px 16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', padding: '0 8px' }}>
          <img src="/PluginAi-Logo.png" alt="Logo" style={{ height: '24px' }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#f87171', letterSpacing: '1px', textTransform: 'uppercase' }}>Admin</span>
        </div>

        <nav style={{ flex: 1 }}>
          <NavItem href="/admin/dashboard" icon="📊" label="Dashboard" />
          <NavItem href="/admin/users" icon="👥" label="Users" />
          <NavItem href="/admin/workspaces" icon="🏢" label="Workspaces" />
          <NavItem href="/admin/subscriptions" icon="💳" label="Subscriptions" />
          <NavItem href="/admin/payments" icon="💰" label="Payments" />
          <NavItem href="/admin/system-analytics" icon="📈" label="System Analytics" />
          <NavItem href="/admin/settings" icon="⚙️" label="Settings" />
        </nav>

        <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px', background: 'transparent',
            color: 'rgba(239,68,68,0.8)', border: 'none', width: '100%',
            cursor: 'pointer', fontWeight: 500, transition: 'color 0.2s',
          }}>
            <span style={{ fontSize: '18px' }}>🚪</span>
            Log Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Topbar */}
        <header style={{
          height: '72px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 32px', background: 'rgba(17,17,17,0.8)', backdropFilter: 'blur(10px)',
          position: 'sticky', top: 0, zIndex: 10
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Command Center</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '16px' }}>
              {adminEmail}
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #7c6df0, #f87171)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold' }}>
              A
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
