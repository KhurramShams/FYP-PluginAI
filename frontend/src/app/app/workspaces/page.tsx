'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchAllWorkspaces, createWorkspace, deleteWorkspace,
  fetchWorkspaceUsageDetails, WorkspaceUsageRecord, Workspace,
} from '@/lib/workspaceService';
import { useWorkspaceStore } from '@/store/workspaceStore';

// ── Colors & Styles ────────────────────────────────────────────────────────
const THEME = {
  primary: '#7c6df0',
  secondary: '#a89ff5',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  bgCard: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  textMain: '#fff',
  textMuted: 'rgba(255,255,255,0.45)',
};

const TooltipStyle = {
  backgroundColor: '#13131a',
  border: `0.5px solid ${THEME.border}`,
  borderRadius: '10px',
  color: THEME.textMain,
  fontSize: '13px',
};

// ── Shared Sub-components ──────────────────────────────────────────────────
function Skeleton({ w = '100%', h = '20px', br = '6px' }: { w?: string; h?: string; br?: string }) {
  return <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.05)', borderRadius: br, animation: 'pulse 1.5s ease-in-out infinite' }} />;
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties; }) {
  return (
    <div style={{ background: THEME.bgCard, border: `0.5px solid ${THEME.border}`, borderRadius: '16px', padding: '24px', ...style }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: '20px' }}>{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: React.ReactNode; accent?: string; }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
      border: `0.5px solid ${THEME.border}`,
      borderRadius: '16px', padding: '20px', transition: 'all 0.25s ease',
      display: 'flex', flexDirection: 'column',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = accent || THEME.primary)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = THEME.border)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${accent || THEME.primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent || THEME.primary }}>
          {icon}
        </div>
        <p style={{ fontSize: '13px', color: THEME.textMuted, fontWeight: 500, margin: 0 }}>{label}</p>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 700, color: THEME.textMain, lineHeight: 1, marginBottom: '8px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{sub}</div>
    </div>
  );
}

function ProgressBar({ label, used, limit, color }: { label: string; used: number; limit: number; color: string; }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{label}</span>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{used?.toLocaleString()} / {limit?.toLocaleString()} ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function WorkspacesPage() {
  const { user, ready } = useAuth();
  const { setWorkspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceStore();

  const [workspaces, setLocal] = useState<Workspace[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  
  const [usage, setUsage] = useState<WorkspaceUsageRecord | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const [error, setError] = useState('');
  
  // Modals / forms
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 1. Fetch workspaces List
  const loadWorkspaces = useCallback(async () => {
    if (!user?.user_id) return;
    setLoadingList(true); setError('');
    try {
      const data = await fetchAllWorkspaces(user.user_id);
      setLocal(data);
      setWorkspaces(data.map((w, i) => ({ id: String(i), name: w.workspace_name, docs_count: w.file_count ?? 0 })));
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load workspaces.');
    } finally {
      setLoadingList(false);
    }
  }, [user?.user_id, setWorkspaces]);

  useEffect(() => { if (ready) loadWorkspaces(); }, [ready, loadWorkspaces]);

  // 2. Fetch specific usage when active activeWorkspace changes
  useEffect(() => {
    if (!activeWorkspace?.name) {
      setUsage(null);
      return;
    }
    const loadUsage = async () => {
      setLoadingUsage(true);
      try {
        const u = await fetchWorkspaceUsageDetails(activeWorkspace.name);
        setUsage(u);
      } catch (e: any) {
        console.error('Failed to load workspace usage:', e);
        setUsage(null);
      } finally {
        setLoadingUsage(false);
      }
    };
    loadUsage();
  }, [activeWorkspace?.name]);

  // Handlers
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(user!.user_id, newName.trim());
      setNewName('');
      setShowCreate(false);
      await loadWorkspaces();
    } catch (e: any) {
      setCreateError(e.response?.data?.detail || 'Failed to create workspace.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    setDeleting(true);
    try {
      await deleteWorkspace(name);
      setDeleteTarget(null);
      if (activeWorkspace?.name === name) setActiveWorkspace(null);
      await loadWorkspaces();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  // Generate a mock nice-looking trend chart based on user_api
  const mockTrendData = React.useMemo(() => {
    if (!usage) return [];
    const base = usage.user_api > 0 ? usage.user_api : 10;
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({
      day,
      requests: Math.floor(base * (0.3 + Math.random() * 0.7) * (i + 1) / 7),
    }));
  }, [usage]);

  const tokenUsed = usage?.user_token ?? 0;
  const tokenLimit = usage?.max_token ?? 0;
  const tokenRemaining = Math.max(0, tokenLimit - tokenUsed);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#fff', marginBottom: '8px', letterSpacing: '-0.5px' }}>Workspace Management</h1>
          <p style={{ fontSize: '15px', color: THEME.textMuted, margin: 0, maxWidth: '600px', lineHeight: 1.5 }}>
            Isolated AI environments. Each workspace securely partitions documents, retains its own conversational memory, and tracks isolated resource usage.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ 
          padding: '12px 24px', background: 'linear-gradient(135deg, #7c6df0, #a89ff5)', 
          border: 'none', borderRadius: '12px', color: '#fff', fontSize: '14px', 
          fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,109,240,0.3)',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          + New Workspace
        </button>
      </div>

      {error && <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '10px', fontSize: '13px', color: '#f87171' }}>⚠ {error}</div>}

      {/* ── Analytics Section (Top) ── */}
      {activeWorkspace?.name && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(124, 109, 240, 0.03)', border: `1px solid rgba(124, 109, 240, 0.15)`, borderRadius: '24px', padding: '32px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
               <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: THEME.success, boxShadow: `0 0 10px ${THEME.success}` }} />
               <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>Analytics: <span style={{ color: THEME.secondary }}>{activeWorkspace.name}</span></h2>
            </div>
            {loadingUsage && <span style={{ fontSize: '13px', color: THEME.textMuted }}>Syncing data...</span>}
          </div>

          {!usage && !loadingUsage ? (
             <div style={{ textAlign: 'center', color: THEME.textMuted, padding: '20px' }}>No usage data found for this workspace.</div>
          ) : (
            <>
              {/* Stats Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <StatCard 
                  accent={THEME.primary} 
                  icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}
                  label="API Keys Generated" value={loadingUsage ? <Skeleton w="50px" h="30px"/> : usage?.user_api ?? 0} 
                  sub={<>Limit: <strong>{usage?.max_api ?? 0}</strong></>} 
                />
                <StatCard 
                  accent={THEME.success} 
                  icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>}
                  label="Documents Uploaded" value={loadingUsage ? <Skeleton w="50px" h="30px"/> : usage?.user_upload ?? 0} 
                  sub={<>Max Limit: <strong>{usage?.max_upload ?? 0}</strong></>} 
                />
                <StatCard 
                  accent={THEME.warning} 
                  icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                  label="Total Tokens Consumed" value={loadingUsage ? <Skeleton w="80px" h="30px"/> : (usage?.user_token ?? 0).toLocaleString()} 
                  sub={<>Quota: <strong>{(usage?.max_token ?? 0).toLocaleString()}</strong></>} 
                />
              </div>

              {/* Charts Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginTop: '8px' }}>
                <Section title="Recent API Request Volume (Mock Trend)">
                  {loadingUsage ? <Skeleton h="180px"/> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={mockTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TooltipStyle} cursor={{ stroke: 'rgba(124,109,240,0.3)' }} />
                        <Line type="monotone" dataKey="requests" stroke={THEME.primary} strokeWidth={3} dot={{ r: 4, fill: '#13131a', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Section>

                <Section title="Resource Constraints">
                  {loadingUsage ? <Skeleton h="180px"/> : (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                       {/* Tokens Pie Chart inside */}
                       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                         <div style={{ position: 'relative', width: '130px', height: '130px' }}>
                           <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={[{ value: tokenUsed }, { value: tokenRemaining }]} cx="50%" cy="50%" innerRadius={45} outerRadius={60} startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                                  <Cell fill={THEME.warning} />
                                  <Cell fill="rgba(255,255,255,0.06)" />
                                </Pie>
                              </PieChart>
                           </ResponsiveContainer>
                           <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                             <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{tokenLimit > 0 ? Math.round((tokenUsed/tokenLimit)*100) : 0}%</span>
                             <span style={{ fontSize: '10px', color: THEME.textMuted }}>Tokens</span>
                           </div>
                         </div>
                       </div>
                       
                       {/* Mini Bars */}
                       <div>
                         <ProgressBar label="Docs" used={usage?.user_upload ?? 0} limit={usage?.max_upload ?? 0} color={THEME.success} />
                         <ProgressBar label="API Keys" used={usage?.user_api ?? 0} limit={usage?.max_api ?? 0} color={THEME.primary} />
                       </div>
                    </div>
                  )}
                </Section>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Workspace Cards Section (Bottom) ── */}
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '20px' }}>Your Workspaces</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {loadingList ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h="180px" />)
          ) : workspaces.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '64px', background: THEME.bgCard, borderRadius: '20px', border: `1px dashed ${THEME.border}` }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(124,109,240,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: THEME.primary }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              </div>
              <p style={{ fontSize: '16px', color: '#fff', fontWeight: 500, marginBottom: '6px' }}>No workspaces found.</p>
              <p style={{ fontSize: '13px', color: THEME.textMuted }}>Create your first workspace to start organizing your intelligent agents.</p>
            </div>
          ) : (
            workspaces.map((ws) => {
              const isActive = activeWorkspace?.name === ws.workspace_name;
              return (
                <div key={ws.workspace_name} style={{ 
                  background: isActive ? 'linear-gradient(145deg, rgba(124,109,240,0.1), rgba(124,109,240,0.02))' : THEME.bgCard, 
                  border: `1px solid ${isActive ? THEME.primary : THEME.border}`, 
                  borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', 
                  transition: 'all 0.3s ease',
                  position: 'relative', overflow: 'hidden',
                  transform: 'translateY(0)',
                  boxShadow: isActive ? '0 10px 30px -10px rgba(124,109,240,0.2)' : 'none',
                }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    if (!isActive) e.currentTarget.style.borderColor = 'rgba(124,109,240,0.4)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    if (!isActive) e.currentTarget.style.borderColor = THEME.border;
                  }}>
                  
                  {isActive && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #7c6df0, #a89ff5)' }} />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: isActive ? '#7c6df0' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#fff' : THEME.textMuted }}>
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{ws.workspace_name}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: THEME.textMuted }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> {ws.created_at?.slice(0, 10) ?? '—'}</span>
                          <span>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> {ws.file_count ?? 0} docs</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button onClick={() => setActiveWorkspace({ id: ws.workspace_name, name: ws.workspace_name, docs_count: ws.file_count ?? 0 })}
                      disabled={isActive}
                      style={{ 
                        flex: 1, padding: '10px', 
                        background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)', 
                        border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : 'transparent'}`, 
                        borderRadius: '10px', 
                        color: isActive ? THEME.success : '#fff', 
                        fontSize: '13px', fontWeight: 600, cursor: isActive ? 'default' : 'pointer',
                        transition: 'all 0.2s'
                      }}>
                      {isActive ? '✓ Active Session' : 'Set Active View'}
                    </button>
                    
                    {deleteTarget === ws.workspace_name ? (
                      <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                        <button onClick={() => handleDelete(ws.workspace_name)} disabled={deleting} 
                          style={{ flex: 1, padding: '10px', background: THEME.danger, border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                          {deleting ? '…' : 'Confirm'}
                        </button>
                        <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                          style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: '10px', color: THEME.textMuted, fontSize: '13px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteTarget(ws.workspace_name)} 
                        style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '10px', color: THEME.textMuted, cursor: 'pointer', transition: 'color 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => e.currentTarget.style.color = THEME.danger}
                        onMouseLeave={e => e.currentTarget.style.color = THEME.textMuted}
                        title="Delete Workspace">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <>
          <div onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#13131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '36px', zIndex: 50, width: '440px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>Initialize Workspace</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: THEME.textMuted, cursor: 'pointer' }}><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            
            <p style={{ fontSize: '14px', color: THEME.textMuted, marginBottom: '28px', lineHeight: 1.5 }}>Names must conform to routing specifications. Only lowercase letters and numbers are permitted (3–30 characters, no spaces).</p>
            
            {createError && <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '10px', fontSize: '13px', color: '#f87171' }}>{createError}</div>}
            
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: THEME.textMuted, marginBottom: '8px', fontWeight: 500 }}>Workspace Name Identifier</label>
                <input value={newName} onChange={e => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  placeholder="e.g. engineeringteam2026" maxLength={30} required disabled={creating}
                  style={{ width: '100%', padding: '14px 16px', background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '12px', color: '#fff', fontSize: '15px', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                  onFocus={e => (e.target.style.borderColor = THEME.primary)}
                  onBlur={e  => (e.target.style.borderColor = THEME.border)} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '14px', background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: '12px', color: 'rgba(255,255,255,0.7)', fontSize: '15px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>Cancel</button>
                <button type="submit" disabled={creating} style={{ flex: 1, padding: '14px', background: THEME.primary, border: 'none', borderRadius: '12px', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.7 : 1, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = THEME.secondary} onMouseLeave={e => e.currentTarget.style.background = THEME.primary}>
                  {creating ? 'Initializing…' : 'Deploy Workspace'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

    </div>
  );
}
