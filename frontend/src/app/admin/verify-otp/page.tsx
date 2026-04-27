'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { verifyAdminOTP, verifyAdminToken, saveAdminSession } from '@/lib/adminAuthService';
import { extractErrorMessage } from '@/lib/authService';

export default function AdminVerifyOTPPage() {
  const router = useRouter();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const tempId = sessionStorage.getItem('admin_temp_user_id');
    if (!tempId) {
      router.replace('/admin/login');
    } else {
      setUserId(tempId);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    
    setError('');
    setLoading(true);

    try {
      const response = await verifyAdminOTP(userId, otp);

      if (response.status === 'success' && response.access_token) {
        // Retrieve full profile to check if role is admin
        const profile = await verifyAdminToken(response.access_token);
        
        if (profile.role !== 'admin') {
          setError('Access denied. Administrator privileges required.');
          sessionStorage.removeItem('admin_temp_user_id');
          return;
        }

        saveAdminSession(response.access_token, profile.user_id, profile.email);
        sessionStorage.removeItem('admin_temp_user_id');
        window.location.replace('/admin/dashboard');

      } else {
        setError(response.message || 'Verification failed. Try again.');
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Invalid code.'));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    color: '#fff', borderRadius: '8px', fontSize: '24px',
    letterSpacing: '8px', textAlign: 'center',
    outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box', opacity: loading ? 0.6 : 1,
  };

  if (!userId) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#0a0a0a' }}>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/PluginAi-Logo.png" alt="Logo" style={{ height: '32px', marginBottom: '24px' }} />
          <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#fff' }}>Admin 2FA</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Enter the administrator verification code.</p>
        </div>

        <Card style={{ padding: '32px' }}>
          {error && (
            <div style={{ padding: '12px 16px', marginBottom: '16px', fontSize: '13px', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <input type="text" maxLength={4} required value={otp} onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0000" disabled={loading} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(124,109,240,0.5)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>

            <Button type="submit" variant="primary" style={{ width: '100%', padding: '13px' }} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify Identity'}
            </Button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
             <Button variant="ghost" onClick={() => router.push('/admin/login')} disabled={loading}>
                Return to Login
             </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
