'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { useRouter } from 'next/navigation';
import adminApi from '@/lib/adminApi';

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Workspace {
  workspace_id: string;
  workspace_name: string;
  user_id: string;
  created_at: string;
  status?: string;
  owner: { email: string; full_name: string; subscription_plan: string };
  doc_count: number;
  usage: { user_upload?: number; user_api?: number; user_token?: number };
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function StatusPill({ status }: { status?: string }) {
  const active = status === 'active';
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      letterSpacing: '0.05em',
      background: active ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
      color: active ? '#34d399' : '#f87171',
      border: `1px solid ${active ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
    }}>
      {(status || 'unknown').toUpperCase()}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '14px 20px', fontWeight: 500, fontSize: '12px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {children}
    </th>
  );
}
function Td({ children, dim, mono, accent }: { children: React.ReactNode; dim?: boolean; mono?: boolean; accent?: string }) {
  return (
    <td style={{ padding: '14px 20px', fontSize: '13px', color: accent || (dim ? 'rgba(255,255,255,0.5)' : '#e5e5e5'), fontFamily: mono ? 'monospace' : undefined, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {children}
    </td>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function AdminWorkspacesPage() {
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        limit: pageSize,
        offset: page * pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;

      const res = await adminApi.get('/admin/workspaces', { params });
      setWorkspaces(res.data.workspaces || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.detail || err?.message || 'Unknown error';
      setError(`HTTP ${status ?? 'N/A'}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0' }}>Global Workspace Directory</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '14px' }}>
            Monitor and govern all tenant workspaces across the platform.
            {total > 0 && <span style={{ marginLeft: 8, color: '#7c6df0' }}>{total} total</span>}
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by workspace name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '9px 16px', borderRadius: '8px', fontSize: '13px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', outline: 'none', width: '280px',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          style={{
            padding: '9px 14px', borderRadius: '8px', fontSize: '13px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: statusFilter ? '#fff' : 'rgba(255,255,255,0.4)', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          onClick={load}
          style={{ padding: '9px 18px', borderRadius: '8px', background: 'rgba(124,109,240,0.15)', border: '1px solid rgba(124,109,240,0.3)', color: '#a78bfa', fontSize: '13px', cursor: 'pointer' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ padding: '14px 20px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', color: '#f87171', fontSize: '13px' }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Table ── */}
      <Card style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                <Th>Workspace Name</Th>
                <Th>Owner</Th>
                <Th>Plan</Th>
                <Th>Created</Th>
                <Th>Status</Th>
                <Th>Files</Th>
                <Th>API Calls</Th>
                <Th>Tokens</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', border: '2px solid rgba(124,109,240,0.3)', borderTopColor: '#7c6df0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Loading workspaces...
                    </div>
                  </td>
                </tr>
              ) : workspaces.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>
                    No workspaces found.
                  </td>
                </tr>
              ) : (
                workspaces.map(w => (
                  <tr key={w.workspace_id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <Td>
                      <span style={{ fontWeight: 600, color: '#fff' }}>{w.workspace_name}</span>
                    </Td>
                    <Td>
                      <div style={{ fontWeight: 500 }}>{w.owner?.full_name || '—'}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{w.owner?.email || '—'}</div>
                    </Td>
                    <Td dim>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>
                        {w.owner?.subscription_plan || 'Free'}
                      </span>
                    </Td>
                    <Td dim>{new Date(w.created_at).toLocaleDateString()}</Td>
                    <Td><StatusPill status={w.status} /></Td>
                    <Td dim>{w.doc_count ?? 0}</Td>
                    <Td dim>{w.usage?.user_api ?? 0}</Td>
                    <Td accent="#a78bfa">{(w.usage?.user_token ?? 0).toLocaleString()}</Td>
                    <Td>
                      <button
                        onClick={() => router.push(`/admin/workspaces/${w.workspace_name}`)}
                        style={{ padding: '5px 14px', borderRadius: '6px', background: 'rgba(124,109,240,0.12)', border: '1px solid rgba(124,109,240,0.25)', color: '#a78bfa', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget.style.background = 'rgba(124,109,240,0.22)'); }}
                        onMouseLeave={e => { (e.currentTarget.style.background = 'rgba(124,109,240,0.12)'); }}
                      >
                        Manage →
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
            <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                style={{ padding: '5px 14px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: page === 0 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: page === 0 ? 'default' : 'pointer' }}
              >← Prev</button>
              <span style={{ padding: '5px 14px', color: '#7c6df0', fontWeight: 600 }}>Page {page + 1} / {totalPages}</span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: '5px 14px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: page >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}
              >Next →</button>
            </div>
          </div>
        )}
      </Card>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
