'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { registerUser, extractErrorMessage } from '@/lib/authService';
import { PublicRouteGuard } from '@/components/auth/PublicRouteGuard';

// ── Reusable styled input ─────────────────────────────────────────────────────
function Field({ label, name, type = 'text', required, placeholder, value, onChange, disabled }: {
  label: string; name: string; type?: string; required?: boolean;
  placeholder: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled: boolean;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#f87171', marginLeft: '3px' }}>*</span>}
      </label>
      <input
        type={type} name={name} required={required} value={value}
        onChange={onChange} placeholder={placeholder} disabled={disabled}
        style={{
          width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px',
          fontSize: '14px', outline: 'none', transition: 'border-color 0.2s',
          opacity: disabled ? 0.6 : 1, boxSizing: 'border-box',
        }}
        onFocus={e  => (e.target.style.borderColor = 'rgba(124,109,240,0.5)')}
        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
      />
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', email: '', password: '', phone_number: '', company_name: '' });
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');

    // Client-side validation mirroring exact backend rules
    if (form.phone_number.length < 10) {
      setError('Phone number must be at least 10 digits long.'); return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }

    setLoading(true);
    try {
      const res = await registerUser({ ...form, role: 'user' });
      setSuccess('Account created! Redirecting to login…');
      setTimeout(() => router.push('/login'), 1800);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Registration failed. Please check your details and try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PublicRouteGuard />
      <Card style={{ padding: '40px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Create an account</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Start building intelligent AI assistants today.</p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', fontSize: '13px', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', fontSize: '13px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '0.5px solid rgba(34,197,94,0.3)', borderRadius: '8px' }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <Field label="Full Name"      name="username"     required placeholder="Sarah Ahmed"      value={form.username}     onChange={handleChange} disabled={loading} />
        <Field label="Email Address"  name="email"        required type="email" placeholder="you@company.com" value={form.email}      onChange={handleChange} disabled={loading} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="Phone Number"  name="phone_number" required placeholder="+92 300 0000000" value={form.phone_number} onChange={handleChange} disabled={loading} />
          <Field label="Company"       name="company_name"           placeholder="Optional"          value={form.company_name} onChange={handleChange} disabled={loading} />
        </div>

        <Field label="Password" name="password" required type="password" placeholder="At least 8 characters" value={form.password} onChange={handleChange} disabled={loading} />

        <Button type="submit" variant="primary" style={{ width: '100%', padding: '13px', marginTop: '6px' }} disabled={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '28px', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: '#fff', fontWeight: 500 }}>Sign in</Link>
      </p>
    </Card>
    </>
  );
}
