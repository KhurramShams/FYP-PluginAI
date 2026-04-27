'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { loginAdminUser, saveAdminSession } from '@/lib/adminAuthService';
import { extractErrorMessage } from '@/lib/authService';
import { verifyAdminToken } from '@/lib/adminAuthService';
import { AdminPublicRouteGuard } from '@/components/auth/AdminRouteGuard';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Step 1: sign in
      const response = await loginAdminUser({ email, password, admin_api_key: adminKey });

      if (response.status === '2fa_required') {
        sessionStorage.setItem('admin_temp_user_id', response.user_id!);
        router.push('/admin/verify-otp');
        return;
      }

      if (response.status === 'success' && response.access_token) {
        // Retrieve full profile to check if role is admin
        const profile = await verifyAdminToken(response.access_token);
        
        if (profile.role !== 'admin') {
          setError('Access denied. Administrator privileges required.');
          return;
        }

        saveAdminSession(response.access_token, profile.user_id, profile.email);
        window.location.replace('/admin/dashboard');
      }

    } catch (err: any) {
      setError(extractErrorMessage(err, 'Invalid email or password.'));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    color: '#fff', borderRadius: '8px', fontSize: '14px',
    outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box', opacity: loading ? 0.6 : 1,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#0a0a0a' }}>
      <AdminPublicRouteGuard />
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/PluginAi-Logo.png" alt="Logo" style={{ height: '32px', marginBottom: '24px' }} />
          <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#fff' }}>Admin Portal</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Sign in to access system controls.</p>
        </div>

        <Card style={{ padding: '32px' }}>
          {error && (
            <div style={{ padding: '12px 16px', marginBottom: '16px', fontSize: '13px', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: 500 }}>Admin Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@pluginai.com" disabled={loading} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(124,109,240,0.5)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: 500 }}>Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" disabled={loading} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(124,109,240,0.5)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: 500 }}>System Gate Key</label>
              <input type="password" required value={adminKey} onChange={e => setAdminKey(e.target.value)}
                placeholder="Secure API Key" disabled={loading} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(239,68,68,0.5)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>

            <Button type="submit" variant="primary" style={{ width: '100%', padding: '13px', marginTop: '8px' }} disabled={loading}>
              {loading ? 'Authenticating…' : 'Secure Login'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
