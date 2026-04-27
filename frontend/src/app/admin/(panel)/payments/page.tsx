'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import adminApi from '@/lib/adminApi';

/* ─── Types ── */
interface Tx {
  id: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  payment_reference_number: string;
  subscription_package_code: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  bank_name: string;
  account_holder: string;
  expiration_date: string;
  created_at?: string;
}

interface Summary {
  total_revenue: number;
  total_count: number;
  success_count: number;
  failed_count: number;
  refunded_count: number;
  pending_count: number;
  plan_revenue: Record<string, number>;
}

/* ─── Helpers ── */
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  succeeded: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  failed:    { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.3)' },
  refunded:  { bg: 'rgba(251,146,60,0.12)',  color: '#fb923c', border: 'rgba(251,146,60,0.3)' },
  pending:   { bg: 'rgba(250,204,21,0.12)',  color: '#facc15', border: 'rgba(250,204,21,0.3)' },
};

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {status.toUpperCase()}
    </span>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#fff' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ─── Detail Drawer ── */
function DetailDrawer({ tx, onClose, onStatusChange }: { tx: Tx; onClose: () => void; onStatusChange: (id: string, s: string) => Promise<void> }) {
  const [detail, setDetail] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminApi.get(`/admin/transactions/${tx.id}`)
      .then(r => setDetail(r.data.transaction))
      .catch(() => setDetail(tx));
  }, [tx.id]);

  const handleStatus = async (newStatus: string) => {
    if (!confirm(`Mark this transaction as "${newStatus}"?`)) return;
    setUpdating(true);
    try {
      await onStatusChange(tx.id, newStatus);
      setMsg(`Status updated to ${newStatus}`);
      if (detail) setDetail({ ...detail, status: newStatus });
    } catch { setMsg('Update failed.'); }
    finally { setUpdating(false); }
  };

  const d = detail || tx;
  const pay = d.payment_details || {};

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
      {/* Drawer */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: '#0d0d14', borderLeft: '1px solid rgba(255,255,255,0.08)', zIndex: 101, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Transaction Detail</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {msg && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(52,211,153,0.1)', border: '1px solid #34d399', color: '#34d399', fontSize: 13 }}>{msg}</div>}

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusPill status={d.status || 'pending'} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{d.created_at ? new Date(d.created_at).toLocaleString() : '—'}</span>
        </div>

        {/* Fields */}
        {[
          ['Transaction ID', d.id, true],
          ['Payment Reference', d.payment_reference_number, true],
          ['User ID', d.user_id, true],
          ['User Email', d.user_email || d.user?.email || '—', false],
          ['Full Name', d.user_full_name || d.user?.full_name || '—', false],
          ['Amount', `${d.currency?.toUpperCase() || 'USD'} ${(d.amount || 0).toFixed(2)}`, false],
          ['Package', d.subscription_package_code || '—', false],
          ['Payment Method', d.payment_method || pay.payment_method_type || '—', false],
          ['Bank / Brand', d.bank_name || pay.bank_name || '—', false],
          ['Account Holder', d.account_holder || pay.account_holder_name || '—', false],
          ['Payment Details ID', d.payment_details_id || '—', true],
        ].map(([k, v, mono]) => (
          <div key={k as string} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div>
            <div style={{ fontSize: 13, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all', color: '#e5e5e5' }}>{v as string}</div>
          </div>
        ))}

        {/* Status actions */}
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Update Status</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['succeeded', 'failed', 'refunded', 'pending'].map(s => {
              const c = STATUS_COLORS[s];
              return (
                <button key={s} onClick={() => handleStatus(s)} disabled={updating || d.status === s}
                  style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: d.status === s ? 'default' : 'pointer', background: d.status === s ? c.bg : 'transparent', border: `1px solid ${c.border}`, color: c.color, opacity: d.status === s ? 1 : 0.7, transition: 'all 0.15s' }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  {d.status === s && ' ✓'}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Main Page ── */
export default function AdminTransactionsPage() {
  // Summary
  const [summary, setSummary] = useState<Summary | null>(null);

  // Table
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Drawer
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);

  // Toast
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const toast = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 500);
    return () => clearTimeout(t);
  }, [search]);

  // Load summary once
  useEffect(() => {
    adminApi.get('/admin/transactions/summary')
      .then(r => setSummary(r.data))
      .catch(() => {});
  }, []);

  // Load transactions
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit: pageSize, offset: page * pageSize };
      if (statusFilter)      params.status  = statusFilter;
      if (packageFilter)     params.package = packageFilter;
      if (debouncedSearch)   params.search  = debouncedSearch;

      const r = await adminApi.get('/admin/transactions', { params });
      setTxs(r.data.transactions || []);
      setTotal(r.data.total || 0);
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || e?.message;
      setError(`HTTP ${status ?? 'N/A'}: ${detail}`);
    } finally { setLoading(false); }
  }, [page, statusFilter, packageFilter, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await adminApi.patch(`/admin/transactions/${id}/status`, { status: newStatus });
    setTxs(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
    if (summary) {
      // Rough re-fetch of summary after change
      adminApi.get('/admin/transactions/summary').then(r => setSummary(r.data)).catch(() => {});
    }
    toast(`Status updated to ${newStatus}.`, true);
  };

  const exportCSV = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_access_token') : '';
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const url = `${base}/admin/transactions/export/csv${statusFilter ? `?status=${statusFilter}` : ''}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    // Pass token via hidden fetch workaround
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const bUrl = URL.createObjectURL(blob);
        a.href = bUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(bUrl);
      });
  };

  const totalPages = Math.ceil(total / pageSize);
  const planColors = ['#7c6df0', '#34d399', '#fb923c', '#f87171', '#a78bfa', '#60a5fa'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Toast */}
      {msg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 10, background: msg.ok ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${msg.ok ? '#34d399' : '#f87171'}`, color: msg.ok ? '#34d399' : '#f87171', fontSize: 13, fontWeight: 500 }}>
          {msg.ok ? '✓' : '⚠'} {msg.text}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Transaction Ledger</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>Full financial audit trail across all platform users.</p>
        </div>
        <button onClick={exportCSV} style={{ padding: '9px 20px', borderRadius: 8, background: 'rgba(124,109,240,0.15)', border: '1px solid rgba(124,109,240,0.3)', color: '#a78bfa', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          ↓ Export CSV
        </button>
      </div>

      {/* ── Summary Cards ── */}
      {summary && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <SummaryCard label="Total Revenue" value={`$${summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="Successful payments only" color="#34d399" />
          <SummaryCard label="All Transactions" value={summary.total_count.toLocaleString()} />
          <SummaryCard label="Succeeded" value={summary.success_count.toLocaleString()} color="#34d399" />
          <SummaryCard label="Failed" value={summary.failed_count.toLocaleString()} color="#f87171" />
          <SummaryCard label="Refunded" value={summary.refunded_count.toLocaleString()} color="#fb923c" />
          <SummaryCard label="Pending" value={summary.pending_count.toLocaleString()} color="#facc15" />
        </div>
      )}

      {/* ── Plan Revenue Distribution ── */}
      {summary && Object.keys(summary.plan_revenue).length > 0 && (
        <Card style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 600 }}>Revenue by Plan</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(summary.plan_revenue).map(([plan, rev], idx) => {
              const maxRev = Math.max(...Object.values(summary.plan_revenue));
              return (
                <div key={plan}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span style={{ color: planColors[idx % planColors.length], fontWeight: 500 }}>{plan}</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>${rev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${maxRev ? (rev / maxRev) * 100 : 0}%`, background: planColors[idx % planColors.length], borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by reference, email, or user ID…"
          style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 300 }}
        />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: statusFilter ? '#fff' : 'rgba(255,255,255,0.4)', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="pending">Pending</option>
        </select>
        <input value={packageFilter} onChange={e => { setPackageFilter(e.target.value); setPage(0); }}
          placeholder="Filter by package code…"
          style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', outline: 'none', width: 180 }} />
        <button onClick={load} style={{ padding: '9px 18px', borderRadius: 8, background: 'rgba(124,109,240,0.12)', border: '1px solid rgba(124,109,240,0.25)', color: '#a78bfa', fontSize: 13, cursor: 'pointer' }}>↻ Refresh</button>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ padding: '14px 20px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#f87171', fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Transaction Table ── */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['Reference', 'User', 'Package', 'Amount', 'Method', 'Date', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '13px 18px', textAlign: i === 7 ? 'right' : 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, height: 28, border: '2px solid rgba(124,109,240,0.3)', borderTopColor: '#7c6df0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Loading transactions…
                    </div>
                  </td>
                </tr>
              ) : txs.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No transactions found.</td></tr>
              ) : txs.map(tx => (
                <tr key={tx.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}>
                  <td style={{ padding: '12px 18px', fontFamily: 'monospace', fontSize: 12, color: '#a78bfa' }}>
                    {tx.payment_reference_number || tx.id?.slice(0, 14) + '…'}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 500 }}>{tx.user_full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{tx.user_email}</div>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 6, background: 'rgba(124,109,240,0.1)', color: '#a78bfa', fontSize: 12 }}>{tx.subscription_package_code || '—'}</span>
                  </td>
                  <td style={{ padding: '12px 18px', fontWeight: 600, color: tx.status === 'succeeded' ? '#34d399' : '#e5e5e5' }}>
                    {tx.currency?.toUpperCase() || 'USD'} {(tx.amount || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 18px', color: 'rgba(255,255,255,0.6)' }}>{tx.payment_method || '—'}</td>
                  <td style={{ padding: '12px 18px', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '12px 18px' }}><StatusPill status={tx.status || 'pending'} /></td>
                  <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                    <button onClick={() => setSelectedTx(tx)}
                      style={{ padding: '5px 14px', borderRadius: 6, background: 'rgba(124,109,240,0.12)', border: '1px solid rgba(124,109,240,0.25)', color: '#a78bfa', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                      Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '13px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: page === 0 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: page === 0 ? 'default' : 'pointer' }}>← Prev</button>
              <span style={{ padding: '5px 14px', color: '#7c6df0', fontWeight: 600 }}>Page {page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: page >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>Next →</button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Detail Drawer ── */}
      {selectedTx && (
        <DetailDrawer
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
