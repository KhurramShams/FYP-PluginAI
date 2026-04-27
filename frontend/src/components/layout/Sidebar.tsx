'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useUserStore } from '@/store/userStore';
import { logoutUser } from '@/lib/authService';
import { useAuth } from '@/hooks/useAuth';

// ── Nav Links ─────────────────────────────────────────────────────────────────
const navLinks = [
  {
    href: '/app/dashboard', label: 'Overview',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
  },
  {
    href: '/app/workspaces', label: 'Workspaces',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
  },
  {
    href: '/app/files', label: 'File Management',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
  },
  {
    href: '/app/api-keys', label: 'API Keys',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
  },
  {
    href: '/app/sandbox', label: 'Agent Sandbox',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
  },
  {
    href: '/app/chat-history', label: 'Chat History',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="19" y2="14"/></svg>
  },
  {
    href: '/app/subscriptions', label: 'Subscription',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  },
  {
    href: '/app/settings', label: 'Settings',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  },
];

// ── User Menu Item ────────────────────────────────────────────────────────────
function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '10px 14px', background: 'transparent', border: 'none',
        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px',
        fontSize: '13px', color: danger ? '#f87171' : 'rgba(255,255,255,0.7)',
        borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Sidebar Component ─────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const { profile, subscription } = useUserStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Derive display values from real data
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const planLabel = subscription?.subscription_package_code || 'No Plan';
  const avatarUrl = profile?.profile_picture_url && profile.profile_picture_url !== '#' ? profile.profile_picture_url : null;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      if (user) await logoutUser(user.user_id, user.email);
    } catch { /* proceed regardless */ }
    useUserStore.getState().clear();
    useWorkspaceStore.getState().setActiveWorkspace(null);
    useWorkspaceStore.getState().setWorkspaces([]);
    // Force a hard DOM unload to destroy all cached UI memory mapped securely
    window.location.href = '/login';
  };

  return (
    <aside style={{
      width: '260px', minWidth: '260px',
      borderRight: '0.5px solid rgba(255,255,255,0.06)',
      background: 'rgba(10,10,15,0.98)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
          <img
            src="/PluginAi-Logo.png"
            alt="Plugin AI"
            style={{ height: '32px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </Link>
      </div>

      {/* ── Workspace Dropdown ──────────────────────────────────────────────── */}
      <div style={{ padding: '0 12px', marginBottom: '8px', position: 'relative' }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            width: '100%', padding: '10px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: '#fff', transition: 'all 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(124,109,240,0.4)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeWorkspace ? '#22c55e' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
              {activeWorkspace?.name || 'No workspace'}
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"
            style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: '12px', right: '12px',
            background: '#13131a', border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', zIndex: 50, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {workspaces.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: '13px', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                No workspaces yet
              </div>
            ) : workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => { setActiveWorkspace(ws); setDropdownOpen(false); }}
                style={{
                  width: '100%', padding: '10px 14px', background: 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  color: activeWorkspace?.id === ws.id ? '#fff' : 'rgba(255,255,255,0.6)',
                  borderBottom: '0.5px solid rgba(255,255,255,0.05)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,109,240,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activeWorkspace?.id === ws.id && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />}
                  <span style={{ fontSize: '13px' }}>{ws.name}</span>
                </div>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{ws.docs_count} docs</span>
              </button>
            ))}
            <Link href="/app/workspaces" onClick={() => setDropdownOpen(false)} style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '10px 14px', background: 'transparent', textDecoration: 'none',
              color: '#7c6df0', fontSize: '13px', transition: 'background 0.15s',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Manage Workspaces
            </Link>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

      {/* ── Nav Links ──────────────────────────────────────────────────────── */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 12px', flex: 1 }}>
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: '10px 14px', borderRadius: '8px',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                background: isActive ? 'rgba(124,109,240,0.15)' : 'transparent',
                fontWeight: isActive ? 500 : 400, fontSize: '13.5px',
                transition: 'all 0.15s', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: '12px',
                borderLeft: isActive ? '2px solid #7c6df0' : '2px solid transparent',
              }}
            >
              <span style={{ color: isActive ? '#7c6df0' : 'rgba(255,255,255,0.4)', transition: 'color 0.15s' }}>
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* ── User Footer with Dropdown Menu ─────────────────────────────────── */}
      <div style={{ padding: '12px', borderTop: '0.5px solid rgba(255,255,255,0.06)', position: 'relative' }}>
        {/* User menu dropdown (appears above the button) */}
        {userMenuOpen && (
          <>
            <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 8px)', left: '12px', right: '12px',
              background: '#13131a', border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', zIndex: 50, overflow: 'hidden',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
            }}>
              {/* User header inside dropdown */}
              <div style={{ padding: '14px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#fff', marginBottom: '2px' }}>{displayName}</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{user?.email}</p>
              </div>

              <MenuItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                label="Update Profile"
                onClick={() => { setUserMenuOpen(false); router.push('/app/profile'); }}
              />
              <MenuItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09"/></svg>}
                label="Settings"
                onClick={() => { setUserMenuOpen(false); router.push('/app/settings'); }}
              />
              <MenuItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
                label="Manage Subscription"
                onClick={() => { setUserMenuOpen(false); router.push('/app/subscriptions'); }}
              />
              <MenuItem
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                label={loggingOut ? 'Logging out…' : 'Logout'}
                onClick={handleLogout}
                danger
              />
            </div>
          </>
        )}

        {/* User profile button */}
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
            background: userMenuOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
            border: 'none', transition: 'background 0.15s', textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = 'transparent'; }}
        >
          {/* Avatar */}
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(124,109,240,0.4), rgba(124,109,240,0.2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 700, color: '#a89ff5',
            }}>
              {initials}
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{planLabel}</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"
            style={{ flexShrink: 0, transform: userMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <polyline points="6 15 12 9 18 15"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}
