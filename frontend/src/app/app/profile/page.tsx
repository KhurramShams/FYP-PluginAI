'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store/userStore';
import { fetchUserProfile, updateUserProfile, UserProfile, UserUpdatePayload } from '@/lib/userService';
import { extractErrorMessage } from '@/lib/authService';
import { Camera, Save, User as UserIcon, Mail, Briefcase, Phone } from 'lucide-react';

const THEME = {
  primary: '#7c6df0',
  bgCard: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  textMuted: 'rgba(255,255,255,0.45)',
  inputBg: 'rgba(255,255,255,0.04)',
};

function Banner({ type, children, onDismiss }: { type: 'success' | 'error'; children: React.ReactNode; onDismiss?: () => void }) {
  const isErr = type === 'error';
  return (
    <div style={{
      padding: '12px 16px', marginBottom: '24px', fontSize: '13px', borderRadius: '10px',
      background: isErr ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
      border: `0.5px solid ${isErr ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
      color: isErr ? '#f87171' : '#22c55e',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span>{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}>×</button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, ready } = useAuth();
  const { profile, setProfile } = useUserStore();
  
  const [loading, setLoading] = useState(!profile);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    phone_number: '',
    profile_picture_url: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready || !user?.user_id) return;
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        company_name: profile.company_name || '',
        phone_number: profile.phone_number || '',
        profile_picture_url: profile.profile_picture_url || '',
      });
      setLoading(false);
      return;
    }
    
    (async () => {
      const p = await fetchUserProfile(user.user_id);
      if (p) {
        setProfile(p);
        setForm({
          full_name: p.full_name || '',
          company_name: p.company_name || '',
          phone_number: p.phone_number || '',
          profile_picture_url: p.profile_picture_url || '',
        });
      }
      setLoading(false);
    })();
  }, [ready, user?.user_id, profile, setProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Future Integration: Send `file` to backend image upload API here.
      // For now, we simulate success by securely mapping the local Object URL as a preview 
      // prior to standardly passing it towards the `profile_picture_url` state field.
      const localUrl = URL.createObjectURL(file);
      setForm(prev => ({ ...prev, profile_picture_url: localUrl }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true); setMsg(null);
    try {
      const payload: UserUpdatePayload = {};
      if (form.full_name !== profile?.full_name) payload.full_name = form.full_name;
      if (form.company_name !== (profile?.company_name || '')) payload.company_name = form.company_name;
      if (form.phone_number !== (profile?.phone_number || '')) payload.phone_number = form.phone_number;
      if (form.profile_picture_url !== (profile?.profile_picture_url || '')) payload.profile_picture_url = form.profile_picture_url;

      if (Object.keys(payload).length === 0) {
        setMsg({ type: 'error', text: 'No changes detected.' });
        setSaving(false); return;
      }

      await updateUserProfile(user.user_id, payload);
      const updatedProfile = await fetchUserProfile(user.user_id);
      if (updatedProfile) setProfile(updatedProfile);
      
      setMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: extractErrorMessage(err, 'Failed to update profile.') });
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loading) {
    return <div style={{ color: THEME.textMuted, padding: '40px' }}>Loading identity configuration...</div>;
  }

  if (!profile || !user) {
    return <div style={{ color: '#f87171', padding: '40px' }}>Unable to resolve active session parameters.</div>;
  }

  const initials = form.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Public Profile</h1>
        <p style={{ fontSize: '14px', color: THEME.textMuted }}>Manage your global identity and visual representation across the platform.</p>
      </div>

      {msg && <Banner type={msg.type} onDismiss={() => setMsg(null)}>{msg.text}</Banner>}

      <form onSubmit={handleSave} style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px', padding: '32px' }}>
        
        {/* Avatar Picker Array */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '40px' }}>
          <div style={{ position: 'relative' }}>
             {form.profile_picture_url && form.profile_picture_url !== '#' ? (
               <img src={form.profile_picture_url} alt="Profile" style={{ width: '84px', height: '84px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${THEME.primary}` }} />
             ) : (
               <div style={{
                 width: '84px', height: '84px', borderRadius: '50%',
                 background: 'linear-gradient(135deg, rgba(124,109,240,0.4), rgba(124,109,240,0.15))',
                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                 fontSize: '28px', fontWeight: 700, color: '#a89ff5',
                 border: `2px solid rgba(124,109,240,0.4)`,
               }}>
                 {initials}
               </div>
             )}
             <button 
               type="button" 
               onClick={() => fileInputRef.current?.click()}
               style={{ position: 'absolute', bottom: '0', right: '0', background: THEME.primary, border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
             >
               <Camera size={14} />
             </button>
             <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" style={{ display: 'none' }} />
          </div>

          <div>
             <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Profile Picture</h3>
             <p style={{ fontSize: '13px', color: THEME.textMuted, maxWidth: '280px', lineHeight: 1.5 }}>
               Upload a high-resolution image to represent your account. Recommended scale is 256x256px.
             </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          
          {/* Identity Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}><UserIcon size={14}/> Full Name</label>
            <input 
              name="full_name" value={form.full_name} onChange={handleChange} required 
              style={{ width: '100%', padding: '12px 14px', background: THEME.inputBg, border: `1px solid ${THEME.border}`, borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' }}
              onFocus={e => (e.target.style.borderColor = THEME.primary)}
              onBlur={e => (e.target.style.borderColor = THEME.border)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}><Briefcase size={14}/> Company Organization (Optional)</label>
            <input 
              name="company_name" value={form.company_name} onChange={handleChange}
              style={{ width: '100%', padding: '12px 14px', background: THEME.inputBg, border: `1px solid ${THEME.border}`, borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' }}
              onFocus={e => (e.target.style.borderColor = THEME.primary)}
              onBlur={e => (e.target.style.borderColor = THEME.border)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14}/> Contact Routing Index</label>
            <input 
              name="phone_number" value={form.phone_number} onChange={handleChange}
              placeholder="+1 ..." 
              style={{ width: '100%', padding: '12px 14px', background: THEME.inputBg, border: `1px solid ${THEME.border}`, borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' }}
              onFocus={e => (e.target.style.borderColor = THEME.primary)}
              onBlur={e => (e.target.style.borderColor = THEME.border)}
            />
          </div>

          {/* Immutable Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14}/> Integrated Email Route</label>
             <input value={profile.email} disabled style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.01)', border: `1px solid ${THEME.border}`, borderRadius: '8px', color: 'rgba(255,255,255,0.4)', fontSize: '14px', outline: 'none', cursor: 'not-allowed' }} />
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '20px', borderTop: `1px solid ${THEME.border}` }}>
          <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px', background: THEME.primary, border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
             <Save size={16}/> {saving ? 'Writing Parameters...' : 'Update Target Identity'}
          </button>
        </div>

      </form>
    </div>
  );
}
