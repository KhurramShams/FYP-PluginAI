'use client';
import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAuth } from '@/hooks/useAuth';
import { fetchUserOverview, fetchWorkspaceUsage, UserOverview, WorkspaceUsage } from '@/lib/dashboardService';
import { fetchSubscriptionDetails, UserSubscription } from '@/lib/subscriptionService';
import Link from 'next/link';

// ── Static chart data (represents trends — not in backend overview response) ──
const queryTrend = [
  { day: 'Mon', queries: 320, tokens: 41000 },
  { day: 'Tue', queries: 480, tokens: 62000 },
  { day: 'Wed', queries: 390, tokens: 51000 },
  { day: 'Thu', queries: 620, tokens: 85000 },
  { day: 'Fri', queries: 540, tokens: 70000 },
  { day: 'Sat', queries: 210, tokens: 28000 },
  { day: 'Sun', queries: 490, tokens: 64000 },
];

const TooltipStyle = {
  backgroundColor: '#13131a',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  color: '#fff',
  fontSize: '13px',
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: string; }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: '16px', padding: '24px', transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(124,109,240,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '12px' }}>{label}</p>
      <p style={{ fontSize: '34px', fontWeight: 700, color: accent || '#fff', lineHeight: 1, marginBottom: '8px' }}>{value}</p>
      <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{sub}</p>
    </div>
  );
}

function UsageBar({ label, pct, color }: { label: string; pct: number; color: string; }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px' }}>
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{label}</span>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
    </div>
  );
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties; }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', ...style }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: '20px' }}>{title}</h3>
      {children}
    </div>
  );
}

function Skeleton({ w = '100%', h = '20px' }: { w?: string; h?: string; }) {
  return <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.05)', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, ready } = useAuth();
  const { activeWorkspace, setWorkspaces } = useWorkspaceStore();

  const [overview, setOverview]   = useState<UserOverview | null>(null);
  const [wsUsage, setWsUsage]     = useState<WorkspaceUsage[]>([]);
  const [subscription, setSub]    = useState<UserSubscription | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    if (!user?.user_id) return;
    setLoading(true); setError('');
    try {
      const [ov, ws, sub] = await Promise.all([
        fetchUserOverview(user.user_id),
        fetchWorkspaceUsage(user.user_id),
        fetchSubscriptionDetails(user.user_id),
      ]);
      setOverview(ov);
      setWsUsage(ws);
      setSub(sub);
      // Sync workspaces into Zustand store so Sidebar dropdown reflects real data
      if (ws.length) {
        setWorkspaces(ws.map((w, i) => ({ id: String(i), name: w.workspace_name, docs_count: w.file_count ?? 0 })));
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Build bar chart data from real workspace usage
  const wsBarData = wsUsage.map(w => ({ name: w.workspace_name, queries: w.usage.api_calls.used }));

  const u = overview?.usage_summary;
  const profile = overview?.profile;
  const wsStats = overview?.workspace_stats;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
            {loading ? 'Dashboard' : `Welcome, ${profile?.full_name?.split(' ')[0] ?? 'back'}`}
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            {activeWorkspace?.name ? <>Workspace: <span style={{ color: '#a89ff5' }}>{activeWorkspace.name}</span> — </> : ''}Last 7 days
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={load} disabled={loading} style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontSize: '13px', cursor: 'pointer' }}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button style={{ padding: '8px 18px', borderRadius: '8px', background: '#7c6df0', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>+ Upload Docs</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '10px', fontSize: '13px', color: '#f87171' }}>
          ⚠ {error} — showing cached or demo data below.
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton w="60%" h="14px" /><Skeleton w="40%" h="36px" /><Skeleton w="80%" h="12px" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Queries Used" value={(u?.queries?.used ?? 0).toLocaleString()} sub={`of ${(u?.queries?.limit ?? 0).toLocaleString()} monthly limit`} accent="#a89ff5" />
            <StatCard label="Tokens Consumed"    value={`${((u?.tokens?.used ?? 0) / 1000).toFixed(1)}K`} sub={`${((u?.tokens?.limit ?? 0) / 1000).toFixed(0)}K total limit`} />
            <StatCard label="Documents Indexed"  value={`${u?.documents?.used ?? 0} / ${u?.documents?.limit ?? 0}`} sub={`${u?.documents?.percentage ?? 0}% of plan limit`} />
            <StatCard label="Active Workspaces"  value={`${wsStats?.active ?? 0} / ${wsStats?.total ?? 0}`} sub={`${(u?.workspaces?.limit ?? 0) - (wsStats?.total ?? 0)} slots remaining`} />
          </>
        )}
      </div>

      {/* Subscription widget */}
      {!loading && (
        <div style={{
          background: subscription
            ? 'linear-gradient(135deg, rgba(124,109,240,0.1) 0%, rgba(124,109,240,0.03) 100%)'
            : 'rgba(239,68,68,0.06)',
          border: subscription ? '0.5px solid rgba(124,109,240,0.2)' : '0.5px solid rgba(239,68,68,0.2)',
          borderRadius: '16px', padding: '24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={subscription ? '#7c6df0' : '#f87171'} strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>
                {subscription ? `${subscription.subscription_package_code} Plan` : 'No Active Subscription'}
              </span>
              {subscription && (
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '0.5px solid rgba(34,197,94,0.25)' }}>
                  {subscription.status}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              {subscription
                ? `Renews on ${subscription.renewal_date?.slice(0, 10) ?? '—'} · Payment: ${subscription.payment_status}`
                : 'Subscribe to a plan to unlock workspaces, API keys, and agent queries.'}
            </p>
          </div>
          <Link href="/app/subscriptions" style={{
            padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
            textDecoration: 'none', transition: 'all 0.2s',
            background: subscription ? 'rgba(255,255,255,0.06)' : '#7c6df0',
            border: subscription ? '0.5px solid rgba(255,255,255,0.1)' : 'none',
            color: '#fff',
          }}>
            {subscription ? 'Manage Plan' : 'Subscribe Now'}
          </Link>
        </div>
      )}

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Section title="Query & Token Volume — 7 Days">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={queryTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradQ" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c6df0" stopOpacity={0.3}/><stop offset="95%" stopColor="#7c6df0" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TooltipStyle} cursor={{ stroke: 'rgba(124,109,240,0.3)' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', paddingTop: '12px' }} />
              <Area type="monotone" dataKey="queries" stroke="#7c6df0" strokeWidth={2} fill="url(#gradQ)" name="Queries" dot={false} />
              <Area type="monotone" dataKey="tokens"  stroke="#22c55e" strokeWidth={2} fill="url(#gradT)" name="Tokens (×100)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>

        <Section title="API Calls per Workspace">
          {wsBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={wsBarData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TooltipStyle} cursor={{ fill: 'rgba(124,109,240,0.05)' }} />
                <Bar dataKey="queries" fill="#7c6df0" radius={[6, 6, 0, 0]} name="API Calls" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
              {loading ? 'Loading…' : 'No workspace data yet.'}
            </div>
          )}
        </Section>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: '16px' }}>

        {/* Workspace table */}
        <Section title="Workspace Breakdown" style={{ gridColumn: 'span 2', padding: '24px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>{['Workspace', 'Status', 'Files', 'Uploads Used', 'Created'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 24px', color: 'rgba(255,255,255,0.35)', fontWeight: 500, fontSize: '12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '32px 24px', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>Loading workspace data…</td></tr>
              ) : wsUsage.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '32px 24px', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>No workspaces yet. Create one to get started.</td></tr>
              ) : wsUsage.map((ws, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '14px 24px', color: '#a89ff5' }}>{ws.workspace_name}</td>
                  <td style={{ padding: '14px 24px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: ws.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)', color: ws.status === 'active' ? '#22c55e' : 'rgba(255,255,255,0.4)', border: `0.5px solid ${ws.status === 'active' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
                      {ws.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 24px', color: 'rgba(255,255,255,0.6)' }}>{ws.file_count ?? 0}</td>
                  <td style={{ padding: '14px 24px', color: 'rgba(255,255,255,0.6)' }}>{ws.usage.uploads.used} / {ws.usage.uploads.limit}</td>
                  <td style={{ padding: '14px 24px', color: 'rgba(255,255,255,0.4)' }}>{ws.created_at?.slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Donut + bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Section title="Token Usage">
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PieChart width={160} height={160}>
                <Pie data={[{ value: u?.tokens?.used ?? 0 }, { value: (u?.tokens?.limit ?? 500000) - (u?.tokens?.used ?? 0) }]}
                  cx={75} cy={75} innerRadius={52} outerRadius={72} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                  <Cell fill="#7c6df0" /><Cell fill="rgba(255,255,255,0.06)" />
                </Pie>
              </PieChart>
            </div>
            <div style={{ textAlign: 'center', marginTop: '-4px', marginBottom: '8px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>{u?.tokens?.percentage ?? 0}%</span>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>of {((u?.tokens?.limit ?? 0) / 1000).toFixed(0)}K limit used</p>
            </div>
          </Section>
          <Section title="Plan Limits">
            <UsageBar label="Documents"  pct={u?.documents?.percentage  ?? 0} color="#7c6df0" />
            <UsageBar label="Queries"    pct={u?.queries?.percentage    ?? 0} color="#22c55e" />
            <UsageBar label="Tokens"     pct={u?.tokens?.percentage     ?? 0} color="#f59e0b" />
            <UsageBar label="API Keys"   pct={u?.api_calls?.percentage  ?? 0} color="#38bdf8" />
          </Section>
        </div>
      </div>
    </div>
  );
}
