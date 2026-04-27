'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import adminApi from '@/lib/adminApi';

/* ─── Types ── */
interface WsDetail {
  workspace_name: string;
  user_id: string;
  created_at: string;
  status?: string;
}
interface Usage { user_upload?: number; user_api?: number; user_token?: number; max_upload?: number; max_api?: number; max_token?: number; }
interface Doc { doc_id: string; file_name: string; file_extension: string; created_at: string; }
interface ApiKey { id: string; status: string; created_at: string; }

/* ─── Reusable sub-components ── */
function StatCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '20px 24px', flex: '1 1 160px' }}>
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: color || '#fff' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ActionBtn({ label, color, bg, border, onClick }: { label: string; color: string; bg: string; border: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '8px 18px', borderRadius: '8px', background: bg, border: `1px solid ${border}`, color, fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'opacity 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
      {label}
    </button>
  );
}

const TABS = ['Overview', 'Files', 'API Keys', 'Conversations', 'Activity'];

/* ─── Page ── */
export default function WorkspaceDetailPage() {
  const { workspaceName } = useParams<{ workspaceName: string }>();
  const router = useRouter();

  const [ws, setWs] = useState<WsDetail | null>(null);
  const [usage, setUsage] = useState<Usage>({});
  const [docs, setDocs] = useState<Doc[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [convCount, setConvCount] = useState(0);
  const [activity, setActivity] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [ownerEmail, setOwnerEmail] = useState('');

  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* ── Load overview (fires on mount) ── */
  useEffect(() => {
    if (!workspaceName) return;
    setLoading(true);
    adminApi.get(`/admin/workspaces/${workspaceName}`)
      .then(r => {
        const d = r.data;
        setWs(d.workspace);
        setUsage(d.usage || {});
        setDocs(d.documents || []);
        setApiKeys(d.api_keys || []);
        setConvCount(d.conversation_count || 0);
      })
      .catch(e => {
        const msg = e?.response?.data?.detail || e?.message;
        if (e?.response?.status === 404) router.push('/admin/workspaces');
        else setError(msg);
      })
      .finally(() => setLoading(false));
  }, [workspaceName, router]);

  /* ── Lazy-load tabs ── */
  const loadActivity = useCallback(async () => {
    setTabLoading(true);
    try {
      const r = await adminApi.get(`/admin/workspaces/${workspaceName}/activity`);
      setActivity(r.data.activity || []);
    } catch { /* ignore */ } finally { setTabLoading(false); }
  }, [workspaceName]);

  const loadConversations = useCallback(async () => {
    setTabLoading(true);
    try {
      const r = await adminApi.get(`/admin/workspaces/${workspaceName}/conversations`);
      setConversations(r.data.conversations || []);
    } catch { /* ignore */ } finally { setTabLoading(false); }
  }, [workspaceName]);

  useEffect(() => {
    if (activeTab === 'Activity' && activity.length === 0) loadActivity();
    if (activeTab === 'Conversations' && conversations.length === 0) loadConversations();
  }, [activeTab]);

  /* ── Actions ── */
  const toast = (text: string, ok: boolean) => { setActionMsg({ text, ok }); setTimeout(() => setActionMsg(null), 3500); };

  const toggleStatus = async (target: 'active' | 'inactive') => {
    const label = target === 'inactive' ? 'suspend' : 'activate';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} workspace "${workspaceName}"?`)) return;
    try {
      await adminApi.patch(`/admin/workspaces/${workspaceName}/status`, null, { params: { status: target } });
      setWs(prev => prev ? { ...prev, status: target } : prev);
      toast(`Workspace ${label}d successfully.`, true);
    } catch (e: any) { toast(e?.response?.data?.detail || 'Action failed.', false); }
  };

  const handleDelete = async () => {
    if (!confirm(`PERMANENTLY delete workspace "${workspaceName}" and all its data? This cannot be undone.`)) return;
    try {
      await adminApi.delete(`/admin/workspaces/${workspaceName}`);
      router.push('/admin/workspaces');
    } catch (e: any) { toast(e?.response?.data?.detail || 'Delete failed.', false); }
  };

  const deleteFile = async (docId: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      await adminApi.delete(`/admin/files/${docId}`);
      setDocs(prev => prev.filter(d => d.doc_id !== docId));
      toast('File deleted.', true);
    } catch { toast('Failed to delete file.', false); }
  };

  const disableKey = async (keyId: string) => {
    if (!confirm('Disable this API key?')) return;
    try {
      await adminApi.patch(`/admin/api-keys/${keyId}/status`, null, { params: { status: 'suspended' } });
      setApiKeys(prev => prev.map(k => k.id === keyId ? { ...k, status: 'suspended' } : k));
      toast('API key disabled.', true);
    } catch { toast('Failed to disable key.', false); }
  };

  /* ── Loading / error states ── */
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 36, height: 36, border: '2px solid rgba(124,109,240,0.3)', borderTopColor: '#7c6df0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Loading workspace…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!ws) return <div style={{ color: '#f87171', padding: 24 }}>⚠ {error || 'Workspace not found.'}</div>;

  const isActive = ws.status === 'active';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Toast */}
      {actionMsg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 10, background: actionMsg.ok ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${actionMsg.ok ? '#34d399' : '#f87171'}`, color: actionMsg.ok ? '#34d399' : '#f87171', fontSize: 13, fontWeight: 500 }}>
          {actionMsg.ok ? '✓' : '⚠'} {actionMsg.text}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button onClick={() => router.push('/admin/workspaces')} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{ws.workspace_name}</h1>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: isActive ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: isActive ? '#34d399' : '#f87171', border: `1px solid ${isActive ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
                {(ws.status || 'unknown').toUpperCase()}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Created {new Date(ws.created_at).toLocaleDateString()} · user_id: {ws.user_id}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {isActive
            ? <ActionBtn label="Suspend Workspace" color="#fb923c" bg="rgba(251,146,60,0.1)" border="rgba(251,146,60,0.35)" onClick={() => toggleStatus('inactive')} />
            : <ActionBtn label="Activate Workspace" color="#34d399" bg="rgba(52,211,153,0.1)" border="rgba(52,211,153,0.35)" onClick={() => toggleStatus('active')} />
          }
          <ActionBtn label="Delete Workspace" color="#f87171" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.3)" onClick={handleDelete} />
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard label="Files Indexed" value={docs.length} sub={`Max: ${usage.max_upload ?? '∞'}`} />
        <StatCard label="Conversations" value={convCount} />
        <StatCard label="API Calls" value={(usage.user_api ?? 0).toLocaleString()} sub={`Max: ${usage.max_api ?? '∞'}`} color="#34d399" />
        <StatCard label="Tokens Used" value={(usage.user_token ?? 0).toLocaleString()} sub={`Max: ${usage.max_token ?? '∞'}`} color="#a78bfa" />
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '7px 18px', borderRadius: 24, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            background: activeTab === t ? '#fff' : 'transparent',
            color: activeTab === t ? '#000' : 'rgba(255,255,255,0.6)',
            border: activeTab === t ? 'none' : '1px solid rgba(255,255,255,0.1)',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Tab Bodies ── */}
      {activeTab === 'Overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Usage Quotas</h3>
            {[
              { label: 'Documents Uploaded', used: usage.user_upload ?? 0, max: usage.max_upload },
              { label: 'API Calls Consumed', used: usage.user_api ?? 0, max: usage.max_api },
              { label: 'Tokens Consumed', used: usage.user_token ?? 0, max: usage.max_token },
            ].map(({ label, used, max }) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</span>
                  <span style={{ color: '#a78bfa' }}>{used.toLocaleString()} {max ? `/ ${max.toLocaleString()}` : ''}</span>
                </div>
                {max ? (
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (used / max) * 100)}%`, background: 'linear-gradient(90deg,#7c6df0,#a78bfa)', borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                ) : null}
              </div>
            ))}
          </Card>
          <Card style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Workspace Metadata</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px', fontSize: 13 }}>
              {[
                ['Workspace Name', ws.workspace_name],
                ['Status', ws.status || '—'],
                ['Created', new Date(ws.created_at).toLocaleString()],
                ['Total Files', docs.length],
                ['Total API Keys', apiKeys.length],
                ['Conversations', convCount],
              ].map(([k, v]) => (
                <div key={k as string} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 140 }}>{k}</span>
                  <span style={{ color: '#e5e5e5', fontWeight: 500 }}>{v as string}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Files' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 15, fontWeight: 600 }}>
            Indexed Documents <span style={{ marginLeft: 8, fontSize: 12, color: '#7c6df0', fontWeight: 400 }}>{docs.length} files</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['File Name', 'Type', 'Uploaded'].map(h => (
                  <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No files uploaded.</td></tr>
              ) : docs.map(d => (
                <tr key={d.doc_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 24px', color: '#e5e5e5' }}>{d.file_name}</td>
                  <td style={{ padding: '12px 24px', color: 'rgba(255,255,255,0.5)' }}>{d.file_extension}</td>
                  <td style={{ padding: '12px 24px', color: 'rgba(255,255,255,0.5)' }}>{new Date(d.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                    <button onClick={() => deleteFile(d.doc_id)} style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'API Keys' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 15, fontWeight: 600 }}>
            Hardware API Keys <span style={{ marginLeft: 8, fontSize: 12, color: '#7c6df0', fontWeight: 400 }}>{apiKeys.length} keys</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                {['Key ID', 'Created', 'Status', 'Action'].map((h, i) => (
                  <th key={h} style={{ padding: '12px 24px', textAlign: i === 3 ? 'right' : 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apiKeys.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No API keys.</td></tr>
              ) : apiKeys.map(k => (
                <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 24px', fontFamily: 'monospace', color: '#e5e5e5', fontSize: 12 }}>{k.id}</td>
                  <td style={{ padding: '12px 24px', color: 'rgba(255,255,255,0.5)' }}>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 24px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: k.status === 'active' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: k.status === 'active' ? '#34d399' : '#f87171' }}>
                      {k.status?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                    {k.status === 'active' && (
                      <button onClick={() => disableKey(k.id)} style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)', color: '#fb923c', fontSize: 12, cursor: 'pointer' }}>Disable</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'Conversations' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 15, fontWeight: 600 }}>
            Conversation Sessions <span style={{ marginLeft: 8, fontSize: 12, color: '#7c6df0', fontWeight: 400 }}>{convCount} total</span>
          </div>
          {tabLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
                <tr>
                  {['Conversation ID', 'Source', 'Started', 'Tokens'].map(h => (
                    <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversations.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No conversations recorded.</td></tr>
                ) : conversations.map((c: any) => (
                  <tr key={c.conversation_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 24px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{c.conversation_id}</td>
                    <td style={{ padding: '12px 24px', color: 'rgba(255,255,255,0.5)' }}>{c.source_type || '—'}</td>
                    <td style={{ padding: '12px 24px', color: 'rgba(255,255,255,0.5)' }}>{c.start_time ? new Date(c.start_time).toLocaleString() : '—'}</td>
                    <td style={{ padding: '12px 24px', color: '#a78bfa' }}>{c.total_tokens_used ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === 'Activity' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 15, fontWeight: 600 }}>Activity Timeline</div>
          {tabLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
          ) : activity.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No activity recorded.</div>
          ) : (
            <div style={{ padding: '8px 24px 24px' }}>
              {activity.map((a: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 16, paddingTop: 16, borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c6df0', marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, color: '#e5e5e5' }}>{a.description || a.event_type || 'Event'}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
