'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Users, Layers, Key, MessageSquare, 
  Cpu, Activity, Zap, ShieldAlert,
  ArrowUpRight, ArrowDownRight, Clock, Database
} from 'lucide-react';
import { 
  fetchAnalyticsOverview, fetchApiUsage, fetchTokenUsage, 
  fetchConversationStats, fetchTopWorkspaces, fetchTopUsersByMetric,
  fetchSystemHealthAnalytics, fetchActivityFeed, flushEmbeddingCache, flushConversationCache 
} from '@/lib/adminService';

const COLORS = ['#7c6df0', '#34d399', '#fb923c', '#f87171', '#a78bfa', '#60a5fa'];

/* ─── Components ── */

function MetricCard({ title, value, icon: Icon, trend, sub }: { title: string; value: string | number; icon: any; trend?: number; sub?: string }) {
  return (
    <Card style={{ padding: 24, flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{title}</span>
        <div style={{ padding: 8, borderRadius: 10, background: 'rgba(124,109,240,0.1)', color: '#7c6df0' }}>
          <Icon size={18} />
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {(trend !== undefined || sub) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          {trend !== undefined && (
            <span style={{ color: trend >= 0 ? '#34d399' : '#f87171', display: 'flex', alignItems: 'center' }}>
              {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(trend)}%
            </span>
          )}
          {sub && <span style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</span>}
        </div>
      )}
    </Card>
  );
}

export default function SystemAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [apiUsage, setApiUsage] = useState<any[]>([]);
  const [tokenUsage, setTokenUsage] = useState<any[]>([]);
  const [convStats, setConvStats] = useState<any[]>([]);
  const [topWorkspaces, setTopWorkspaces] = useState<any[]>([]);
  const [topUsers, setTopUsers] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, au, tu, cs, tw, tu_m, sh, af] = await Promise.all([
        fetchAnalyticsOverview(days),
        fetchApiUsage(days),
        fetchTokenUsage(days),
        fetchConversationStats(days),
        fetchTopWorkspaces(10),
        fetchTopUsersByMetric('user_token', 10),
        fetchSystemHealthAnalytics(),
        fetchActivityFeed(20)
      ]);
      
      setOverview(ov);
      setApiUsage(au.usage || []);
      setTokenUsage(tu.usage || []);
      setConvStats(cs.stats || []);
      setTopWorkspaces(tw.top_workspaces || []);
      setTopUsers(tu_m.top_users || []);
      setHealth(sh.health || null);
      setFeed(af.feed || []);
    } catch (e) {
      console.error('Failed to load analytics:', e);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading && !overview) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Initializing Dashboard...</div>;
  }

  const pieData = overview ? Object.entries(overview.plan_distribution || {}).map(([name, value]) => ({ name, value })) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Header & Time Selector ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px' }}>System Analytics</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>Real-time platform observability and resource monitoring.</p>
        </div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} 
              style={{ 
                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: days === d ? 'rgba(124,109,240,0.2)' : 'transparent',
                color: days === d ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                border: 'none', transition: 'all 0.2s'
              }}>
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview Cards ── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <MetricCard title="Total Users" value={overview?.growth?.total_users.toLocaleString() || 0} icon={Users} trend={12} sub="Growth this month" />
        <MetricCard title="Workspaces" value={overview?.growth?.new_workspaces.toLocaleString() || 0} icon={Layers} trend={8} sub="New this period" />
        <MetricCard title="Total API Calls" value={overview?.usage_totals?.api_calls.toLocaleString() || 0} icon={Zap} trend={24} sub="Requests processed" />
        <MetricCard title="Total Tokens" value={(overview?.usage_totals?.tokens / 1000000).toFixed(1) + 'M' || 0} icon={Cpu} trend={15} sub="Millions consumed" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
        {/* ── API Usage Chart ── */}
        <Card style={{ padding: 24, height: 400 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>API Request Trends</h3>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={apiUsage}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
              <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }} />
              <Line type="monotone" dataKey="requests" stroke="#7c6df0" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* ── Token Consumption Chart ── */}
        <Card style={{ padding: 24, height: 400 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Token Consumption</h3>
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={tokenUsage}>
              <defs>
                <linearGradient id="colorPrompt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c6df0" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#7c6df0" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCompletion" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
              <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }} />
              <Legend verticalAlign="top" height={36}/>
              <Area type="monotone" dataKey="prompt" stroke="#7c6df0" fillOpacity={1} fill="url(#colorPrompt)" />
              <Area type="monotone" dataKey="completion" stroke="#34d399" fillOpacity={1} fill="url(#colorCompletion)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
        {/* ── Conversation Stats Chart ── */}
        <Card style={{ padding: 24, height: 400 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Conversation Activity</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={convStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
              <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }} />
              <Legend verticalAlign="top" height={36}/>
              <Bar dataKey="conversations" fill="#fb923c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="messages" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* ── Subscription Distribution ── */}
        <Card style={{ padding: 24, height: 400, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Subscription Distribution</h3>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* ── Top Workspaces Table ── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Most Active Workspaces</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['Workspace', 'Owner', 'Tokens', 'Requests'].map(h => (
                  <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topWorkspaces.map(ws => (
                <tr key={ws.workspace_name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 24px', fontWeight: 500 }}>{ws.workspace_name}</td>
                  <td style={{ padding: '12px 24px', color: 'rgba(255,255,255,0.5)' }}>{ws.owner_email}</td>
                  <td style={{ padding: '12px 24px', color: '#a78bfa' }}>{ws.tokens_used.toLocaleString()}</td>
                  <td style={{ padding: '12px 24px' }}>{ws.api_requests.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* ── Top Users Table ── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Top Consumption Users</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['User', 'Plan', 'Tokens'].map(h => (
                  <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topUsers.map((u, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 24px' }}>
                    <div style={{ fontWeight: 500 }}>{u.user.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{u.user.email}</div>
                  </td>
                  <td style={{ padding: '12px 24px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(124,109,240,0.1)', color: '#a78bfa', fontSize: 11 }}>{u.user.subscription_plan}</span>
                  </td>
                  <td style={{ padding: '12px 24px', fontWeight: 600, color: '#34d399' }}>{u.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
        {/* ── Real-Time Activity Feed ── */}
        <Card style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} color="#7c6df0" /> System Activity Stream
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {feed.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 16, borderBottom: i === feed.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ 
                  width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                  background: log.event_category === 'error' ? '#f87171' : log.event_category === 'system' ? '#a78bfa' : '#34d399'
                }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 13, color: '#e5e5e5' }}>{log.description}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {new Date(log.created_at).toLocaleTimeString()}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> ID: {log.user_id.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── System Health Metrics ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>System Health</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>AVG LATENCY</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#34d399' }}>{health?.avg_latency_ms || 0}ms</div>
              </div>
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>SUCCESS RATE</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>{health?.success_rate || 0}%</div>
              </div>
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>ERROR RATE</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171' }}>{health?.error_rate || 0}%</div>
              </div>
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>UPTIME</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#34d399' }}>{health?.uptime_days || 0} Days</div>
              </div>
            </div>
          </Card>

          <Card style={{ padding: 24, background: 'linear-gradient(135deg, rgba(124,109,240,0.1), rgba(52,211,153,0.1))', border: '1px solid rgba(124,109,240,0.2)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={18} /> Operational Awareness
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0 }}>
              All metrics are aggregated every 60 seconds. Storage monitoring tracks Pinecone vector usage and document store growth. 
              API latency represents the mean processing time across all model inference calls.
            </p>
          </Card>
        </div>
      </div>

      {/* ── Maintenance Section ── */}
      <Card style={{ padding: 24, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.02)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={18} /> System Maintenance & Cache Control
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Embedding RAG Cache</h4>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Pinecone inference caching mapped via Redis. Purging forces context refetch.</p>
            <button 
              onClick={async () => { if(confirm('Flush embedding cache?')) await flushEmbeddingCache(); }}
              style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, cursor: 'pointer' }}>
              Flush Embeddings
            </button>
          </div>
          <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Conversation Log Cache</h4>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Temporary historical chat logs. Managed in Redis before Postgres sync.</p>
            <button 
              onClick={async () => { if(confirm('Flush conversation cache?')) await flushConversationCache(); }}
              style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, cursor: 'pointer' }}>
              Flush Conversations
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
