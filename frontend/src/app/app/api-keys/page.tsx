'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { generateApiKey, fetchAllApiKeys, fetchApiUsage, ApiKey, ApiUsageData, deleteApiKey } from '@/lib/apiKeyService';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Key, Activity, Zap, Cpu, Server, Network, AlignLeft, CheckCircle2, ChevronDown, Lock, Eye, Trash2, Plus, AlertCircle, Copy } from 'lucide-react';
import { extractErrorMessage } from '@/lib/authService';

const THEME = {
  primary: '#7c6df0',
  bgCard: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  textMain: '#fff',
  textMuted: 'rgba(255,255,255,0.45)',
  success: '#22c55e',
  blue: '#3b82f6',
  orange: '#f97316',
  danger: '#ef4444',
};

// ── Shared UI Utilities ────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const active = status.toLowerCase() === 'active';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 600, background: active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)', color: active ? THEME.success : THEME.textMuted, border: `0.5px solid ${active ? 'rgba(34,197,94,0.25)' : THEME.border}` }}>
      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: active ? THEME.success : THEME.textMuted, boxShadow: active ? `0 0 6px ${THEME.success}` : 'none' }} />
      {status.toUpperCase()}
    </span>
  );
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  alert('Copied to clipboard!');
}

function maskKey(key: string) {
  if (!key || key.length <= 15) return key || '';
  return `${key.substring(0, 12)}...${key.substring(key.length - 4)}`;
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function Drawer({ apiKey, onClose }: { apiKey: ApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [usage, setUsage] = useState<ApiUsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchUsageData = async () => {
      setLoadingUsage(true);
      try {
        const data = await fetchApiUsage(apiKey.api_key, apiKey.workspace_name);
        if (active) setUsage(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoadingUsage(false);
      }
    };
    fetchUsageData();
    return () => { active = false; };
  }, [apiKey]);

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  
  const totalTokens = usage ? usage.total_prompt_tokens + usage.total_completion_tokens : 0;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px', background: '#13131a', borderLeft: `1px solid ${THEME.border}`, zIndex: 50, overflowY: 'auto', padding: '32px', boxShadow: '-20px 0 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <h2 style={{ fontSize: '18px', color: '#fff', fontWeight: 600 }}>API Details</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: THEME.textMuted, cursor: 'pointer', fontSize: '24px' }}>×</button>
        </div>
        
        <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          {[['Workspace', apiKey.workspace_name], ['Status', null], ['Created', apiKey.created_at ? new Date(apiKey.created_at).toLocaleDateString() : '—']].map(([k, v]) => (
            <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${THEME.border}` }}>
              <span style={{ fontSize: '13px', color: THEME.textMuted }}>{k}</span>
              {k === 'Status' ? <StatusBadge status={apiKey.status} /> : <span style={{ fontSize: '13px', color: '#fff' }}>{v}</span>}
            </div>
          ))}
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
               <span style={{ fontSize: '12px', color: THEME.textMuted }}>API Key Context</span>
               <button onClick={() => setShowKey(!showKey)} style={{ background: 'none', border: 'none', color: THEME.primary, fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                 {showKey ? 'Hide Key' : 'Reveal Key'}
               </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: '13px', color: '#a89ff5', background: '#0d0d14', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${THEME.border}`, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {showKey ? apiKey.api_key : maskKey(apiKey.api_key)}
              </code>
              <button onClick={() => copy(apiKey.api_key)} style={{ padding: '10px 16px', background: 'rgba(124,109,240,0.1)', border: '1px solid rgba(124,109,240,0.3)', borderRadius: '8px', color: '#a89ff5', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>Usage Statistics</h3>
          <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '16px' }}>
             {loadingUsage ? (
               <p style={{ fontSize: '13px', color: THEME.textMuted, textAlign: 'center', margin: 0 }}>Loading usage...</p>
             ) : usage ? (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '13px', color: THEME.textMuted }}>Average Latency</span><span style={{ fontSize: '13px', color: '#fff' }}>{usage.avg_latency_ms} ms</span></div>
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '13px', color: THEME.textMuted }}>Total Tokens</span><span style={{ fontSize: '13px', color: '#fff' }}>{totalTokens.toLocaleString()}</span></div>
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '13px', color: THEME.textMuted }}>Workspace Usage</span><span style={{ fontSize: '13px', color: '#fff' }}>{usage.user_token.toLocaleString()} / {usage.max_token.toLocaleString()}</span></div>
               </div>
             ) : (
               <p style={{ fontSize: '13px', color: THEME.textMuted, textAlign: 'center', margin: 0 }}>No statistics available.</p>
             )}
          </div>
        </div>
        
        <div>
           <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>Integration Mapping</h3>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#0d0d14', border: `1px solid ${THEME.border}`, padding: '12px', borderRadius: '8px' }}>
                 <div style={{ fontSize: '11px', color: THEME.blue, fontWeight: 700, marginBottom: '4px' }}>PORTAL PROTOCOL (INTERNAL)</div>
                 <code style={{ fontSize: '12px', color: THEME.textMuted }}>POST /v1/web/query/portal_query</code>
              </div>
              <div style={{ background: '#0d0d14', border: `1px solid ${THEME.border}`, padding: '12px', borderRadius: '8px' }}>
                 <div style={{ fontSize: '11px', color: THEME.orange, fontWeight: 700, marginBottom: '4px' }}>USER PROTOCOL (EXTERNAL)</div>
                 <code style={{ fontSize: '12px', color: THEME.textMuted }}>POST /call/user/query/user_api_query</code>
              </div>
           </div>
        </div>

      </div>
    </>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function ApiSelectorDropdown({ keys, selectedKey, onSelect, loading }: { keys: ApiKey[], selectedKey: ApiKey | null, onSelect: (k: ApiKey) => void, loading: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: '320px' }}>
      <div 
        onClick={() => !loading && keys.length > 0 && setOpen(!open)}
        style={{ 
          background: 'rgba(0,0,0,0.3)', border: `1px solid ${open ? THEME.primary : THEME.border}`, borderRadius: '12px', 
          padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          cursor: loading || keys.length === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.2s', boxShadow: open ? `0 0 0 2px rgba(124,109,240,0.2)` : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Network size={18} color={THEME.primary} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: THEME.textMuted, fontWeight: 500, marginBottom: '2px' }}>TARGET INTEGRATION</span>
            <span style={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>
              {loading ? 'Syncing...' : selectedKey ? maskKey(selectedKey.api_key) : 'No APIs Available'}
            </span>
          </div>
        </div>
        <ChevronDown size={18} color={THEME.textMuted} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </div>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', background: '#13131a', border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '8px', zIndex: 50, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', maxHeight: '300px', overflowY: 'auto' }}>
          {keys.map((k) => (
            <div 
              key={k.api_key} 
              onClick={() => { onSelect(k); setOpen(false); }}
              style={{ 
                padding: '12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: selectedKey?.api_key === k.api_key ? 'rgba(124,109,240,0.1)' : 'transparent', border: `1px solid ${selectedKey?.api_key === k.api_key ? 'rgba(124,109,240,0.2)' : 'transparent'}`
              }}
              onMouseEnter={e => { if (selectedKey?.api_key !== k.api_key) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (selectedKey?.api_key !== k.api_key) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '14px', color: '#fff', fontWeight: 500, fontFamily: 'monospace' }}>{maskKey(k.api_key)}</span>
                <span style={{ fontSize: '11px', color: THEME.textMuted }}>{k.workspace_name} • {new Date(k.created_at).toLocaleDateString()}</span>
              </div>
              <StatusBadge status={k.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApiStatsCards({ usageData }: { usageData: ApiUsageData | null }) {
  if (!usageData) return null;
  const totalTokens = usageData.total_prompt_tokens + usageData.total_completion_tokens;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '24px' }}>
      {[
        { t: "Average Latency", v: `${usageData.avg_latency_ms} ms`, i: <Activity size={20} color={THEME.success}/>, s: "Model reaction bound" },
        { t: "Token Burn", v: totalTokens.toLocaleString(), i: <Zap size={20} color={THEME.orange}/>, s: "Aggregate query compute" },
        { t: "Prompt Context", v: usageData.total_prompt_tokens.toLocaleString(), i: <AlignLeft size={20} color={THEME.blue}/>, s: "Tokens supplied to agent" },
        { t: "Completion Yield", v: usageData.total_completion_tokens.toLocaleString(), i: <CheckCircle2 size={20} color={THEME.primary}/>, s: "Tokens produced by agent" }
      ].map((st, idx) => (
        <div key={idx} style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', color: THEME.textMuted, fontWeight: 500 }}>{st.t}</span>
            <div style={{ padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>{st.i}</div>
          </div>
          <span style={{ fontSize: '28px', fontWeight: 700, color: '#fff' }}>{st.v}</span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>{st.s}</span>
        </div>
      ))}
    </div>
  );
}

function ApiUsageCharts({ usageData }: { usageData: ApiUsageData | null }) {
  if (!usageData) return null;
  const totalTokens = usageData.total_prompt_tokens + usageData.total_completion_tokens;
  const pieData = [
    { name: 'Prompt Tokens', value: usageData.total_prompt_tokens, color: THEME.primary },
    { name: 'Completion Tokens', value: usageData.total_completion_tokens, color: THEME.blue }
  ];
  const burnPercent = usageData.max_token > 0 ? Math.min((usageData.user_token / usageData.max_token) * 100, 100).toFixed(1) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginTop: '24px' }}>
      
      <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}><Cpu size={18} color={THEME.textMuted}/> Compute Distribution</h3>
        <p style={{ fontSize: '13px', color: THEME.textMuted, marginBottom: '24px' }}>Ratio of context interpretation to generative output mapping over the API's lifetime.</p>
        <div style={{ width: '100%', height: '200px' }}>
          {totalTokens === 0 ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.textMuted, fontSize: '12px' }}>Insufficient Data Volume</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {pieData.map((e, idx) => <Cell key={idx} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#13131a', border: `1px solid ${THEME.border}`, borderRadius: '12px' }} itemStyle={{ color: '#fff', fontSize: '13px' }}/>
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', color: THEME.textMuted }}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}><Zap size={18} color={THEME.orange}/> Token Constraint Monitor</h3>
        <p style={{ fontSize: '13px', color: THEME.textMuted, marginBottom: '40px' }}>Tracks the token allocation assigned to the parent workspace against current throughput.</p>
        
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', height: '28px', width: '100%', overflow: 'hidden', border: `1px solid ${THEME.border}`, position: 'relative' }}>
            <div style={{ width: `${burnPercent}%`, height: '100%', background: `linear-gradient(90deg, ${THEME.primary}, ${THEME.orange})`, transition: 'width 1s ease-out' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <span style={{ fontSize: '13px', color: THEME.textMuted }}>Consumed: <strong style={{ color: '#fff' }}>{usageData.user_token.toLocaleString()}</strong></span>
          <span style={{ fontSize: '15px', color: THEME.orange, fontWeight: 700 }}>{burnPercent}%</span>
          <span style={{ fontSize: '13px', color: THEME.textMuted }}>Limit: <strong style={{ color: '#fff' }}>{usageData.max_token.toLocaleString()}</strong></span>
        </div>
      </div>
    </div>
  );
}

function TargetAuthoritiesPanel({ selectedKey }: { selectedKey: ApiKey | null }) {
  if (!selectedKey) return null;
  return (
    <div style={{ marginTop: '32px', marginBottom: '32px', border: `1px dashed rgba(249,115,22,0.4)`, background: 'rgba(249,115,22,0.02)', borderRadius: '16px', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ padding: '8px', background: 'rgba(249,115,22,0.1)', borderRadius: '10px' }}><Lock size={18} color={THEME.orange}/></div>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', margin: 0 }}>Target Authorities</h3>
      </div>
      <p style={{ fontSize: '13px', color: THEME.textMuted, marginBottom: '24px' }}>Confidential integration tunnels explicitly authorized for the active token context.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        <div style={{ background: '#0d0d14', border: `1px solid ${THEME.border}`, padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: THEME.blue, fontWeight: 700, textTransform: 'uppercase' }}>Direct Portal Protocol</span>
            <span style={{ fontSize: '10px', background: 'rgba(59,130,246,0.15)', color: THEME.blue, padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>POST</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '8px' }}>
            <code style={{ fontSize: '13px', color: '#fff', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>/v1/web/query/portal_query</code>
            <button onClick={() => copyText('/v1/web/query/portal_query')} style={{ background: 'none', border: 'none', color: THEME.textMuted, cursor: 'pointer' }}><Copy size={14}/></button>
          </div>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '12px 0 0' }}>Internal gateway routing for first-party sandbox environments.</p>
        </div>

        <div style={{ background: '#0d0d14', border: `1px solid ${THEME.border}`, padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: THEME.orange, fontWeight: 700, textTransform: 'uppercase' }}>External User API Protocol</span>
            <span style={{ fontSize: '10px', background: 'rgba(249,115,22,0.15)', color: THEME.orange, padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>POST</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '8px' }}>
             <code style={{ fontSize: '13px', color: '#fff', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>/call/user/query/user_api_query</code>
             <button onClick={() => copyText('/call/user/query/user_api_query')} style={{ background: 'none', border: 'none', color: THEME.textMuted, cursor: 'pointer' }}><Copy size={14}/></button>
          </div>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '12px 0 0' }}>Production endpoints designated for third-party REST deployment layers.</p>
        </div>

      </div>

      <div style={{ marginTop: '24px', background: 'rgba(249,115,22,0.1)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <span style={{ display: 'block', fontSize: '11px', color: THEME.orange, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Active Header Injection Token</span>
           <code style={{ fontSize: '15px', color: '#fff', fontWeight: 600 }}>{selectedKey.api_key}</code>
        </div>
        <button onClick={() => copyText(selectedKey.api_key)} style={{ padding: '10px 20px', background: THEME.orange, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Copy size={16}/> Copy Secret</button>
      </div>

    </div>
  );
}

function ApiManagementPanel({ keys, activeWorkspace, onGenerate, onDelete, onSelectKey, generating }: { keys: ApiKey[], activeWorkspace: any, onGenerate: () => void, onDelete: (key: string) => void, onSelectKey: (k: ApiKey) => void, generating: boolean }) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px', overflow: 'hidden', marginTop: '32px' }}>
      
      <div style={{ padding: '24px', borderBottom: `1px solid ${THEME.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Key size={20} color={THEME.primary}/> Infrastructure Registry</h3>
          <p style={{ fontSize: '13px', color: THEME.textMuted, margin: '4px 0 0' }}>Comprehensive ledger of generated tokens dictating platform access.</p>
        </div>
        <button 
           onClick={onGenerate} 
           disabled={generating || !activeWorkspace?.name} 
           style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: THEME.primary, border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: (generating || !activeWorkspace?.name) ? 'not-allowed' : 'pointer', opacity: (generating || !activeWorkspace?.name) ? 0.5 : 1, transition: 'all 0.2s', boxShadow: `0 4px 12px rgba(124,109,240,0.3)` }}
        >
          <Plus size={16} />
          {generating ? 'Provisioning…' : 'Generate New Key'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
              {['API Name / Identity', 'Status', 'Workspace Context', 'Provision Date', 'Actions'].map((h, i) => (
                <th key={h} style={{ padding: '16px 24px', color: THEME.textMuted, fontWeight: 500, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${THEME.border}`, textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '60px', textAlign: 'center', color: THEME.textMuted }}>No integrations exist within the system registry.</td></tr>
            ) : (
              keys.map((ep, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${THEME.border}`, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '18px 24px' }}>
                    <code style={{ fontSize: '13px', color: '#fff', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${THEME.border}` }}>
                      {maskKey(ep.api_key)}
                    </code>
                  </td>
                  <td style={{ padding: '18px 24px' }}><StatusBadge status={ep.status} /></td>
                  <td style={{ padding: '18px 24px', color: 'rgba(255,255,255,0.7)' }}>{ep.workspace_name}</td>
                  <td style={{ padding: '18px 24px', color: THEME.textMuted }}>{new Date(ep.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '18px 24px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button onClick={() => onSelectKey(ep)} style={{ padding: '8px', background: 'rgba(124,109,240,0.1)', border: '1px solid rgba(124,109,240,0.2)', color: THEME.primary, cursor: 'pointer', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }} title="Load Analytics" onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,109,240,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,109,240,0.1)'}>
                        View Details
                      </button>
                      
                      {deleteTarget === ep.api_key ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button onClick={() => { onDelete(ep.api_key); setDeleteTarget(null); }} style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.2)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: '6px', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
                          <button onClick={() => setDeleteTarget(null)} style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: '6px', color: THEME.textMuted, fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteTarget(ep.api_key)} style={{ padding: '8px', background: 'transparent', border: '1px solid transparent', color: THEME.textMuted, cursor: 'pointer', borderRadius: '8px' }} title="Revoke Identity" onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = THEME.danger; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = THEME.textMuted; }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Controller ───────────────────────────────────────────────────────────
export default function ApiManagementPage() {
  const { user, ready } = useAuth();
  const { activeWorkspace } = useWorkspaceStore();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [detailsKey, setDetailsKey] = useState<ApiKey | null>(null);
  const [usageData, setUsageData] = useState<ApiUsageData | null>(null);

  const [loadingKeys, setLoadingKeys] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  const loadKeys = useCallback(async (preserveSelection = false) => {
    if (!user?.user_id) return;
    setLoadingKeys(true);
    try {
      const data = await fetchAllApiKeys(user.user_id);
      setKeys(data);
      if (data.length > 0) {
        if (!preserveSelection || !selectedKey || !data.find(k => k.api_key === selectedKey.api_key)) {
           setSelectedKey(data[0]);
        }
      } else {
        setSelectedKey(null);
      }
    } catch (e: any) {
      setError(extractErrorMessage(e, 'Failed to fetch integrations.'));
    } finally {
      setLoadingKeys(false);
    }
  }, [user?.user_id, selectedKey]);

  useEffect(() => { if (ready) loadKeys(); }, [ready]);

  useEffect(() => {
    let active = true;
    const fetchUsage = async () => {
      if (!selectedKey) { setUsageData(null); return; }
      setLoadingUsage(true);
      try {
        const data = await fetchApiUsage(selectedKey.api_key, selectedKey.workspace_name);
        if (active) setUsageData(data);
      } catch (err: any) {
        console.error("Usage fetch failed:", err);
      } finally {
        if (active) setLoadingUsage(false);
      }
    };
    fetchUsage();
    return () => { active = false; };
  }, [selectedKey]);

  const handleGenerate = async () => {
    if (!user?.user_id || !activeWorkspace?.name) return;
    setGenerating(true); setError('');
    try {
      await generateApiKey(user.user_id, activeWorkspace.name);
      await loadKeys(true);
    } catch (e: any) {
      setError(extractErrorMessage(e, 'Failed to provision endpoint key.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (apiKey: string) => {
    if (!user?.user_id) return;
    try {
      await deleteApiKey(user.user_id, apiKey);
      await loadKeys();
    } catch (e: any) {
      setError(extractErrorMessage(e, 'Failed to delete identity.'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '1400px', margin: '0 auto', gap: '8px' }}>
      
      {detailsKey && <Drawer apiKey={detailsKey} onClose={() => setDetailsKey(null)} />}

      {error && <div style={{ marginBottom: '16px', padding: '16px', background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: '12px', fontSize: '14px', color: THEME.danger, display: 'flex', alignItems: 'center', gap: '12px' }}><AlertCircle size={20}/> {error}</div>}

      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
         <div>
            <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Analytics & Intelligence</h1>
            <p style={{ fontSize: '14px', color: THEME.textMuted, margin: 0 }}>Assess live consumption metrics generated by designated deployment gateways.</p>
         </div>
         <ApiSelectorDropdown keys={keys} selectedKey={selectedKey} onSelect={setSelectedKey} loading={loadingKeys} />
      </div>

      {loadingUsage ? (
         <div style={{ height: '300px', background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <span style={{ color: THEME.textMuted, fontSize: '14px', animation: 'pulse 2s infinite' }}>Querying telemetry from pipeline...</span>
         </div>
      ) : selectedKey ? (
         <>
           <ApiStatsCards usageData={usageData} />
           <ApiUsageCharts usageData={usageData} />
         </>
      ) : (
         <div style={{ height: '300px', background: THEME.bgCard, border: `1px dashed ${THEME.border}`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
            <Server size={32} color={THEME.textMuted} style={{ opacity: 0.5 }} />
            <h3 style={{ fontSize: '16px', color: '#fff' }}>No Active Selection</h3>
            <span style={{ color: THEME.textMuted, fontSize: '14px' }}>Provision an API Identity below to track logic pipelines.</span>
         </div>
      )}

      {selectedKey && <TargetAuthoritiesPanel selectedKey={selectedKey} />}

      <ApiManagementPanel 
        keys={keys} 
        activeWorkspace={activeWorkspace} 
        onGenerate={handleGenerate} 
        onDelete={handleDelete} 
        onSelectKey={(k) => setDetailsKey(k)} 
        generating={generating} 
      />

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}}/>
    </div>
  );
}
