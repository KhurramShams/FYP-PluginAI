'use client';
import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { fetchSystemHealth, AdminSystemHealth } from '@/lib/adminService';

export default function AdminDashboardOverview() {
  const [health, setHealth] = useState<AdminSystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSystemHealth()
      .then(setHealth)
      .finally(() => setLoading(false));
  }, []);

  const MetricCard = ({ title, value, subtitle }: { title: string, value: string | number, subtitle?: string }) => (
    <Card style={{ padding: '24px', flex: '1 1 200px' }}>
      <h3 style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: '8px' }}>{title}</h3>
      <div style={{ fontSize: '32px', fontWeight: 600, color: '#fff' }}>{value}</div>
      {subtitle && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>{subtitle}</div>}
    </Card>
  );

  if (loading) return <div style={{ color: '#fff' }}>Loading metrics...</div>;
  if (!health) return <div style={{ color: '#f87171' }}>Failed to load system health.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '28px', margin: '0 0 8px 0' }}>System Overview</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Review platform-wide analytics and core service health.</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
        <MetricCard title="Total Users" value={health.platform?.total_users ?? 0} subtitle="Registered platform accounts" />
        <MetricCard title="Active Workspaces" value={health.platform?.total_workspaces ?? 0} subtitle="Created tenant workspaces" />
        <MetricCard title="Documents Synced" value={health.platform?.total_documents ?? 0} subtitle="Pinecone vector embeddings" />
        <MetricCard title="System Status" value={health.status === 'healthy' ? 'Operational' : 'Degraded'} subtitle={`Supabase: ${health.services?.supabase?.status || 'N/A'}`} />
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <Card style={{ padding: '24px', flex: 2 }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: '16px' }}>Service Connections</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span>Postgres / Supabase</span>
              <span style={{ color: health.services?.supabase?.status === 'ok' ? '#34d399' : '#f87171' }}>
                {health.services?.supabase?.status?.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span>Redis Cache Engine</span>
              <span style={{ color: health.services?.redis?.status === 'ok' ? '#34d399' : '#f87171' }}>
                {health.services?.redis?.status?.toUpperCase()}
              </span>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '24px', flex: 1 }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: '16px' }}>Recent Audit Logs</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Audit logging active. System actions securely recorded in AdminAuditLogs.</p>
        </Card>
      </div>
    </div>
  );
}
