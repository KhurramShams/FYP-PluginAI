'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import adminApi from '@/lib/adminApi';

/* ─── Helpers ── */
function Label({ text }: { text: string }) {
  return <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{text}</div>;
}
function StatusPill({ status }: { status?: string }) {
  const active = status === 'active';
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: active ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: active ? '#34d399' : '#f87171', border: `1px solid ${active ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
      {(status || 'unknown').toUpperCase()}
    </span>
  );
}

type Tab = 'Subscriptions' | 'Plans' | 'Analytics';

export default function AdminSubscriptionsPage() {
  const [tab, setTab] = useState<Tab>('Subscriptions');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const toast = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input::placeholder { color: rgba(255,255,255,0.3); }`}</style>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Subscription Control Centre</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>Manage platform subscriptions, control global plans, and review analytics.</p>
      </div>

      {msg && (
        <div style={{ padding: '12px 18px', borderRadius: 8, background: msg.ok ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? '#34d399' : '#f87171'}`, color: msg.ok ? '#34d399' : '#f87171', fontSize: 13 }}>
          {msg.ok ? '✓' : '⚠'} {msg.text}
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14 }}>
        {(['Subscriptions', 'Plans', 'Analytics'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 20px', borderRadius: 24, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#000' : 'rgba(255,255,255,0.6)', border: tab === t ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>{t}</button>
        ))}
      </div>

      {tab === 'Subscriptions' && <AllSubscriptionsTab toast={toast} />}
      {tab === 'Plans' && <PlansTab toast={toast} />}
      {tab === 'Analytics' && <AnalyticsTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTIONS TAB — paginated table of all user subscriptions
════════════════════════════════════════════════════════════════ */
function AllSubscriptionsTab({ toast }: { toast: (t: string, ok: boolean) => void }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // inline control state
  const [extendTarget, setExtendTarget] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState('30');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.get('/admin/subscriptions', { params: { limit: pageSize, offset: page * pageSize } });
      setSubs(r.data.subscriptions || []);
      setTotal(r.data.total || 0);
    } catch { /* */ } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (subId: string) => {
    if (!confirm('Soft-cancel this subscription?')) return;
    try { await adminApi.post(`/admin/subscriptions/cancel/${subId}`); toast('Subscription cancelled.', true); load(); }
    catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  const resetUsage = async (subId: string) => {
    if (!confirm('Reset all usage counters?')) return;
    try { await adminApi.post(`/admin/subscriptions/reset_usage/${subId}`); toast('Usage reset.', true); load(); }
    catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  const extend = async (subId: string) => {
    try {
      await adminApi.post('/admin/subscriptions/extend', { subscription_id: subId, days: Number(extendDays) });
      toast(`Extended by ${extendDays} days.`, true); setExtendTarget(null); load();
    } catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{total} subscriptions in system</span>
        <button onClick={load} style={{ padding: '7px 16px', borderRadius: 8, background: 'rgba(124,109,240,0.12)', border: '1px solid rgba(124,109,240,0.25)', color: '#a78bfa', fontSize: 13, cursor: 'pointer' }}>↻ Refresh</button>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['User', 'Plan', 'Status', 'Start', 'End', 'API Used', 'Tokens Used', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '13px 18px', textAlign: i === 7 ? 'right' : 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 26, height: 26, border: '2px solid rgba(124,109,240,0.3)', borderTopColor: '#7c6df0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Loading subscriptions…
                  </div>
                </td></tr>
              ) : subs.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No subscriptions found.</td></tr>
              ) : subs.map(s => (
                <React.Fragment key={s.subscription_id}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.user?.full_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.user?.email || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(124,109,240,0.12)', color: '#a78bfa', fontSize: 12 }}>{s.user?.subscription_plan || '—'}</span>
                    </td>
                    <td style={{ padding: '12px 18px' }}><StatusPill status={s.status} /></td>
                    <td style={{ padding: '12px 18px', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{s.status === 'active' ? '—' : '—'}</td>
                    <td style={{ padding: '12px 18px', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>—</td>
                    <td style={{ padding: '12px 18px', color: 'rgba(255,255,255,0.6)' }}>{(s.user_api ?? 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 18px', color: '#a78bfa' }}>{(s.user_token ?? 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => setExtendTarget(extendTarget === s.subscription_id ? null : s.subscription_id)} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontSize: 11, cursor: 'pointer' }}>Extend</button>
                        <button onClick={() => resetUsage(s.subscription_id)} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)', color: '#fb923c', fontSize: 11, cursor: 'pointer' }}>Reset</button>
                        {s.status === 'active' && <button onClick={() => cancel(s.subscription_id)} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Cancel</button>}
                      </div>
                    </td>
                  </tr>
                  {extendTarget === s.subscription_id && (
                    <tr style={{ background: 'rgba(52,211,153,0.03)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td colSpan={8} style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Extend by:</span>
                          {['30', '60', '90', '180', '365'].map(d => (
                            <button key={d} onClick={() => setExtendDays(d)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: extendDays === d ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${extendDays === d ? '#34d399' : 'rgba(255,255,255,0.1)'}`, color: extendDays === d ? '#34d399' : '#e5e5e5' }}>{d}d</button>
                          ))}
                          <button onClick={() => extend(s.subscription_id)} style={{ padding: '5px 14px', borderRadius: 6, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Confirm +{extendDays} days</button>
                          <button onClick={() => setExtendTarget(null)} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            <span>Page {page + 1} of {totalPages} ({total} total)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: page === 0 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: page === 0 ? 'default' : 'pointer' }}>← Prev</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: page >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>Next →</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PLANS TAB — view all DimSubscriptionPackages
════════════════════════════════════════════════════════════════ */
function PlansTab({ toast }: { toast: (t: string, ok: boolean) => void }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.get('/admin/plans');
      setPlans(r.data.plans || []);
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading plans…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{plans.length} plans in DimSubscriptionPackages</span>
        <button onClick={load} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(124,109,240,0.12)', border: '1px solid rgba(124,109,240,0.25)', color: '#a78bfa', fontSize: 13, cursor: 'pointer' }}>↻ Refresh</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {plans.map(p => (
          <div key={p.id || p.subscription_code} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{p.subscription_name || p.subscription_code}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>${p.price}<span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>/mo</span></div>
            </div>
            <div style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(124,109,240,0.1)', color: '#a78bfa', fontSize: 12, alignSelf: 'flex-start', fontFamily: 'monospace' }}>{p.subscription_code}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
              {[
                ['Workspaces', p.workspaces],
                ['API Keys', p.api_keys_limit],
                ['Doc Upload Limit', p.document_upload_limit],
                ['Query Limit', p.query_limit],
                ['Max Tokens', (p.max_tokens || 0).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <Label text={k as string} />
                  <div style={{ fontWeight: 500 }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No plans configured in DimSubscriptionPackages.</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS TAB — plan distribution + aggregate usage
════════════════════════════════════════════════════════════════ */
function AnalyticsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.get('/admin/analytics/overview', { params: { days: 30 } })
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading analytics…</div>;
  if (!data) return <div style={{ padding: 24, color: '#f87171' }}>Failed to load analytics.</div>;

  const dist: Record<string, number> = data.plan_distribution || {};
  const totalPlanUsers = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const planColors = ['#7c6df0', '#34d399', '#fb923c', '#f87171', '#a78bfa', '#60a5fa'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stat summary */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Users', value: (data.growth?.total_users ?? 0).toLocaleString(), color: '#fff' },
          { label: 'New Users (30d)', value: (data.growth?.new_users ?? 0).toLocaleString(), color: '#34d399' },
          { label: 'New Workspaces (30d)', value: (data.growth?.new_workspaces ?? 0).toLocaleString(), color: '#a78bfa' },
          { label: 'Total API Calls', value: (data.usage_totals?.api_calls ?? 0).toLocaleString(), color: '#34d399' },
          { label: 'Total Tokens', value: (data.usage_totals?.tokens ?? 0).toLocaleString(), color: '#a78bfa' },
          { label: 'Total Documents', value: (data.usage_totals?.documents ?? 0).toLocaleString(), color: '#fb923c' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 22px' }}>
            <Label text={label} />
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Plan distribution */}
      <Card style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16 }}>Plan Distribution</h3>
        {Object.entries(dist).length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No data available.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.entries(dist).map(([plan, count], idx) => (
              <div key={plan}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: planColors[idx % planColors.length], fontWeight: 500 }}>{plan}</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{count} users ({((count / totalPlanUsers) * 100).toFixed(1)}%)</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ height: '100%', width: `${(count / totalPlanUsers) * 100}%`, background: planColors[idx % planColors.length], borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Activity breakdown */}
      {data.activity_breakdown && Object.keys(data.activity_breakdown).length > 0 && (
        <Card style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Activity Breakdown (Last 30 Days)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {Object.entries(data.activity_breakdown).map(([cat, count]) => (
              <div key={cat} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 18px' }}>
                <Label text={cat} />
                <div style={{ fontSize: 22, fontWeight: 700, color: '#a78bfa' }}>{(count as number).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
