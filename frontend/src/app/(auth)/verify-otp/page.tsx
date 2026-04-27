'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { verifyOTP, verifyToken, saveSession, extractErrorMessage } from '@/lib/authService';

export default function VerifyOTPPage() {
  const router = useRouter();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Check if user_id is in sessionStorage, if not, redirect to login
    const tempId = sessionStorage.getItem('temp_user_id');
    if (!tempId) {
      router.replace('/login');
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
      const response = await verifyOTP(userId, otp);

      if (response.status === 'success' && response.access_token) {
        // Step 2: call /auth/google/verify to resolve the real user_id + profile
        const profile = await verifyToken(response.access_token);

        // Step 3: persist everything to localStorage
        saveSession(response.access_token, profile.user_id, profile.email);
        
        // Clean up session storage
        sessionStorage.removeItem('temp_user_id');

        // Step 4: redirect into the app
        window.location.replace('/app/dashboard');
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

  if (!userId) return null; // Wait for initial check

  return (
    <Card style={{ padding: '40px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Two-Factor Authentication</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Enter the verification code sent to your email.</p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', fontSize: '13px', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: 500 }}>Verification Code</label>
          <input type="text" maxLength={4} required value={otp} onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0000" disabled={loading} style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'rgba(124,109,240,0.5)')}
            onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
        </div>

        <Button type="submit" variant="primary" style={{ width: '100%', padding: '13px', marginTop: '4px' }} disabled={loading}>
          {loading ? 'Verifying…' : 'Verify Code'}
        </Button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '24px' }}>
         <Button 
            variant="ghost" 
            onClick={() => router.push('/login')} 
            disabled={loading}
            style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}
          >
            Return to Login
         </Button>
      </div>
    </Card>
  );
}
