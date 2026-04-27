'use client';
import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { fetchAllUsers, AdminUsersResponse, AdminUser } from '@/lib/adminService';
import { useRouter } from 'next/navigation';

export default function AdminUsersPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllUsers()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#fff' }}>Loading users...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: '0 0 8px 0' }}>User Management</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>View and manage platform users. Total records: {data?.total || 0}</p>
        </div>
      </div>

      <Card style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>User / Email</th>
                <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Company</th>
                <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Plan</th>
                <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Role</th>
                <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Joined</th>
                <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.users?.map((u: AdminUser) => (
                <tr key={u.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ fontWeight: 500 }}>{u.full_name || 'Unnamed'}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>{u.email}</div>
                  </td>
                  <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{u.company_name || '—'}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ background: 'rgba(124,109,240,0.1)', color: '#7c6df0', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', textTransform: 'uppercase' }}>
                      {u.subscription_plan}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                     <span style={{ color: u.role === 'admin' ? '#f87171' : (u.role === 'suspended' ? 'orange' : '#34d399') }}>
                      {u.role.toUpperCase()}
                     </span>
                  </td>
                  <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.5)' }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <button 
                      onClick={() => router.push(`/admin/users/${u.user_id}`)}
                      style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
              {(!data?.users || data.users.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
