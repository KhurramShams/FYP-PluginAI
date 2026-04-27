'use client';
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useParams, useRouter } from 'next/navigation';
import { fetchUserProfile, suspendUser, unsuspendUser, deleteUserAccount, fetchUserSubscriptions, fetchUserWorkspaces, fetchUserApiKeys, fetchUserFiles, fetchUserConversations, fetchUserPayments, fetchUserActivity } from '@/lib/adminService';
import adminApi from '@/lib/adminApi';

// --- Tab Components ---

const ProfileTab = ({ userId, profile }: { userId: string, profile: any }) => {
  const router = useRouter();
  
  const handleSuspend = async () => {
    if (!confirm('Are you sure you want to suspend this user?')) return;
    await suspendUser(userId, 'Administrative action');
    window.location.reload();
  };
  
  const handleUnsuspend = async () => {
    await unsuspendUser(userId);
    window.location.reload();
  };
  
  const handleDelete = async () => {
    if (!confirm('CRITICAL: Are you sure you want to PERMANENTLY delete this user and all data?')) return;
    await deleteUserAccount(userId);
    router.push('/admin/users');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Card style={{ padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#fff', fontSize: '18px' }}>Account Status</h3>
        <div style={{ display: 'flex', gap: '48px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Created On</div>
            <div style={{ fontSize: '15px' }}>{new Date(profile.created_at).toLocaleDateString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Last Login</div>
            <div style={{ fontSize: '15px' }}>{profile.last_login ? new Date(profile.last_login).toLocaleDateString() : 'Never'}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>System Role</div>
            <div style={{ fontSize: '15px', color: profile.role === 'admin' ? '#f87171' : '#34d399' }}>{profile.role.toUpperCase()}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>2FA Security</div>
            <div style={{ fontSize: '15px' }}>{profile.two_fa_enabled ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>

        <h3 style={{ margin: '24px 0 16px 0', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px', color: '#fff', fontSize: '18px' }}>Administrative Actions</h3>
        <div style={{ display: 'flex', gap: '16px' }}>
          {profile.role === 'suspended' ? (
            <Button variant="outline" onClick={handleUnsuspend} style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid #34d399' }}>Reactivate Account</Button>
          ) : (
            <Button variant="outline" onClick={handleSuspend} style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid #fb923c' }}>Suspend Account</Button>
          )}
          <Button variant="outline" onClick={handleDelete} style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid #f87171' }}>Permanently Delete User</Button>
        </div>
      </Card>
    </div>
  );
};

const TablePlaceholder = ({ title, children }: any) => (
  <Card style={{ padding: '0', overflow: 'hidden' }}>
    <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
    </div>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
        {children}
      </table>
    </div>
  </Card>
);

const SubscriptionsTab = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // quota override state
  const [quotaEdit, setQuotaEdit] = useState(false);
  const [qMaxApi, setQMaxApi] = useState('');
  const [qMaxToken, setQMaxToken] = useState('');
  const [qMaxDocs, setQMaxDocs] = useState('');
  const [qMaxWs, setQMaxWs] = useState('');

  // extend state
  const [extendDays, setExtendDays] = useState('30');

  const toast = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); };

  const reload = () => {
    setLoading(true);
    fetchUserSubscriptions(userId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    adminApi.get('/admin/plans').then(r => setPlans(r.data.plans || [])).catch(() => {});
  }, [userId]);

  const handlePlanChange = async (newPlan: string) => {
    if (!confirm(`Change plan to "${newPlan}"?`)) return;
    try {
      await adminApi.put('/admin/subscriptions/plan', { user_id: userId, new_plan: newPlan });
      toast('Plan updated.', true); reload();
    } catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  const handleExtend = async () => {
    if (!data?.subscription?.subscription_id) return;
    try {
      await adminApi.post('/admin/subscriptions/extend', { subscription_id: data.subscription.subscription_id, days: Number(extendDays) });
      toast(`Extended by ${extendDays} days.`, true); reload();
    } catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  const handleResetUsage = async () => {
    if (!data?.subscription?.subscription_id) return;
    if (!confirm('Reset all usage counters to 0?')) return;
    try {
      await adminApi.post(`/admin/subscriptions/reset_usage/${data.subscription.subscription_id}`);
      toast('Usage counters reset.', true); reload();
    } catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  const handleCancel = async () => {
    if (!data?.subscription?.subscription_id) return;
    if (!confirm('Cancel this subscription? It will be marked cancelled but data is preserved.')) return;
    try {
      await adminApi.post(`/admin/subscriptions/cancel/${data.subscription.subscription_id}`);
      toast('Subscription cancelled.', true); reload();
    } catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  const handleQuotaSave = async () => {
    if (!data?.usage?.subscription_id) return;
    const body: any = { subscription_id: data.usage.subscription_id };
    if (qMaxApi) body.max_api = Number(qMaxApi);
    if (qMaxToken) body.max_token = Number(qMaxToken);
    if (qMaxDocs) body.max_upload_docs = Number(qMaxDocs);
    if (qMaxWs) body.max_workspace = Number(qMaxWs);
    try {
      await adminApi.put('/admin/subscriptions/quota', body);
      toast('Quotas updated.', true); setQuotaEdit(false); reload();
    } catch (e: any) { toast(e?.response?.data?.detail || 'Failed.', false); }
  };

  if (loading) return <div style={{ padding: 24, color: 'rgba(255,255,255,0.4)' }}>Loading subscription…</div>;

  const sub = data?.subscription;
  const usage = data?.usage;

  const usageRows = sub ? [
    { label: 'Documents', used: usage?.user_uploded_docs ?? 0, max: usage?.max_upload_docs },
    { label: 'API Calls', used: usage?.user_api ?? 0, max: usage?.max_api },
    { label: 'Tokens', used: usage?.user_token ?? 0, max: usage?.max_token },
    { label: 'Workspaces', used: usage?.user_workspace ?? 0, max: usage?.max_workspace },
  ] : [];

  const isActive = sub?.status === 'active';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {msg && (
        <div style={{ padding: '12px 18px', borderRadius: 8, background: msg.ok ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? '#34d399' : '#f87171'}`, color: msg.ok ? '#34d399' : '#f87171', fontSize: 13 }}>
          {msg.ok ? '✓' : '⚠'} {msg.text}
        </div>
      )}

      {/* ── Subscription Info Card ── */}
      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Subscription Details</h3>
          {sub && (
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: isActive ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: isActive ? '#34d399' : '#f87171', border: `1px solid ${isActive ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
              {sub.status?.toUpperCase()}
            </span>
          )}
        </div>

        {!sub ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', padding: '24px 0' }}>No subscription found for this user.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px 32px', marginBottom: 24 }}>
              {[
                ['Plan Code', sub.subscription_package_code || '—'],
                ['Start Date', sub.start_date ? new Date(sub.start_date).toLocaleDateString() : '—'],
                ['End Date', sub.end_date ? new Date(sub.end_date).toLocaleDateString() : '—'],
                ['Payment Status', sub.payment_status || '—'],
                ['Subscription ID', sub.subscription_id?.slice(0, 16) + '…'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Usage bars */}
            {usageRows.map(({ label, used, max }) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
                  <span style={{ color: '#a78bfa' }}>{used.toLocaleString()} {max ? `/ ${max.toLocaleString()}` : ''}</span>
                </div>
                {max ? (
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (used / max) * 100)}%`, background: 'linear-gradient(90deg,#7c6df0,#a78bfa)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                ) : null}
              </div>
            ))}
          </>
        )}
      </Card>

      {/* ── Action Panel ── */}
      {sub && (
        <Card style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16 }}>Subscription Controls</h3>

          {/* Change Plan */}
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Change Plan</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {plans.length === 0 ? (
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading plans…</span>
              ) : plans.map((p: any) => (
                <button key={p.subscription_code}
                  onClick={() => handlePlanChange(p.subscription_code)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                    background: sub.subscription_package_code === p.subscription_code ? 'rgba(124,109,240,0.3)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${sub.subscription_package_code === p.subscription_code ? '#7c6df0' : 'rgba(255,255,255,0.1)'}`,
                    color: sub.subscription_package_code === p.subscription_code ? '#a78bfa' : '#e5e5e5',
                  }}>
                  {p.subscription_name || p.subscription_code}
                  {sub.subscription_package_code === p.subscription_code && <span style={{ marginLeft: 6, fontSize: 10, color: '#7c6df0' }}>CURRENT</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Extend */}
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Extend Subscription</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {['30', '60', '90', '180', '365'].map(d => (
                <button key={d} onClick={() => setExtendDays(d)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: extendDays === d ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${extendDays === d ? '#34d399' : 'rgba(255,255,255,0.1)'}`, color: extendDays === d ? '#34d399' : '#e5e5e5' }}>{d}d</button>
              ))}
              <button onClick={handleExtend} style={{ padding: '6px 16px', borderRadius: 6, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', fontSize: 13, cursor: 'pointer' }}>
                Extend +{extendDays} days
              </button>
            </div>
          </div>

          {/* Quota Override */}
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Override Quota Limits</div>
              <button onClick={() => setQuotaEdit(!quotaEdit)} style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e5e5', fontSize: 12, cursor: 'pointer' }}>
                {quotaEdit ? 'Cancel' : 'Edit Quotas'}
              </button>
            </div>
            {quotaEdit && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                {[
                  { label: 'Max API Calls', val: qMaxApi, set: setQMaxApi, placeholder: String(usage?.max_api || '') },
                  { label: 'Max Tokens', val: qMaxToken, set: setQMaxToken, placeholder: String(usage?.max_token || '') },
                  { label: 'Max Documents', val: qMaxDocs, set: setQMaxDocs, placeholder: String(usage?.max_upload_docs || '') },
                  { label: 'Max Workspaces', val: qMaxWs, set: setQMaxWs, placeholder: String(usage?.max_workspace || '') },
                ].map(({ label, val, set, placeholder }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
                    <input value={val} onChange={e => set(e.target.value)} placeholder={`Current: ${placeholder}`}
                      style={{ width: '100%', padding: '7px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  <button onClick={handleQuotaSave} style={{ padding: '8px 20px', borderRadius: 8, background: 'rgba(124,109,240,0.2)', border: '1px solid rgba(124,109,240,0.4)', color: '#a78bfa', fontSize: 13, cursor: 'pointer' }}>Save Quota Overrides</button>
                </div>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleResetUsage} style={{ padding: '7px 16px', borderRadius: 8, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', color: '#fb923c', fontSize: 13, cursor: 'pointer' }}>
              Reset Usage Counters
            </button>
            {isActive && (
              <button onClick={handleCancel} style={{ padding: '7px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13, cursor: 'pointer' }}>
                Cancel Subscription
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

const WorkspacesTab = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetchUserWorkspaces(userId).then(setData) }, [userId]);
  if (!data) return <div>Loading...</div>;
  return (
    <TablePlaceholder title="Workspaces">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Workspace Name</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Created At</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Role Mode</th>
        </tr>
      </thead>
      <tbody>
        {data.workspaces?.map((w: any) => (
          <tr key={w.workspace_name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '16px 24px' }}>{w.workspace_name}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{new Date(w.created_at).toLocaleDateString()}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{w.role_mode}</td>
          </tr>
        ))}
      </tbody>
    </TablePlaceholder>
  );
};

const ApiKeysTab = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetchUserApiKeys(userId).then(setData) }, [userId]);
  if (!data) return <div>Loading...</div>;
  return (
    <TablePlaceholder title="Hardware API Keys">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>API Name</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Workspace</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {data.api_keys?.map((k: any) => (
          <tr key={k.api_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '16px 24px', fontFamily: 'monospace' }}>{k.api_name}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{k.workspace_name}</td>
            <td style={{ padding: '16px 24px', color: k.status === 'active' ? '#34d399' : '#f87171' }}>{k.status.toUpperCase()}</td>
          </tr>
        ))}
      </tbody>
    </TablePlaceholder>
  );
};

const FilesTab = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetchUserFiles(userId).then(setData) }, [userId]);
  if (!data) return <div>Loading...</div>;
  return (
    <TablePlaceholder title="Indexed Pinecone Documents">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>File Name</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Type</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Workspace</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Tokens</th>
        </tr>
      </thead>
      <tbody>
        {data.files?.map((f: any) => (
          <tr key={f.doc_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '16px 24px' }}>{f.file_name}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{f.file_type}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{f.workspace_name}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{f.total_tokens || 0}</td>
          </tr>
        ))}
      </tbody>
    </TablePlaceholder>
  );
};

const ConversationsTab = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetchUserConversations(userId).then(setData) }, [userId]);
  if (!data) return <div>Loading...</div>;
  return (
    <TablePlaceholder title="RAG Interactions">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Workspace</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Query Start</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Tokens Ejected</th>
        </tr>
      </thead>
      <tbody>
        {data.conversations?.map((c: any) => (
          <tr key={c.conversation_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '16px 24px' }}>{c.workspace_name}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{new Date(c.start_time).toLocaleString()}</td>
            <td style={{ padding: '16px 24px', color: '#7c6df0' }}>{c.total_tokens_used || 0}</td>
          </tr>
        ))}
      </tbody>
    </TablePlaceholder>
  );
};

const PaymentsTab = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetchUserPayments(userId).then(setData) }, [userId]);
  if (!data) return <div>Loading...</div>;
  return (
    <TablePlaceholder title="Stripe Ledger">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Transaction ID</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Date</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Amount</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {data.payments?.map((p: any) => (
          <tr key={p.transaction_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '16px 24px', fontFamily: 'monospace' }}>{p.stripe_transaction_id || p.transaction_id}</td>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{new Date(p.payment_date).toLocaleDateString()}</td>
            <td style={{ padding: '16px 24px' }}>${p.amount_paid}</td>
            <td style={{ padding: '16px 24px', color: p.payment_status === 'success' ? '#34d399' : '#f87171' }}>{p.payment_status.toUpperCase()}</td>
          </tr>
        ))}
      </tbody>
    </TablePlaceholder>
  );
};

const ActivityTab = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetchUserActivity(userId).then(setData) }, [userId]);
  if (!data) return <div>Loading...</div>;
  return (
    <TablePlaceholder title="Recent Telemetry Logs">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Timestamp</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Event Type</th>
          <th style={{ padding: '16px 24px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Description</th>
        </tr>
      </thead>
      <tbody>
        {data.activity?.map((a: any, i: number) => (
          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '16px 24px', color: 'rgba(255,255,255,0.7)' }}>{new Date(a.created_at).toLocaleString()}</td>
            <td style={{ padding: '16px 24px', color: '#7c6df0' }}>{a.event_type}</td>
            <td style={{ padding: '16px 24px' }}>{a.description}</td>
          </tr>
        ))}
      </tbody>
    </TablePlaceholder>
  );
};

// --- Main Page Wrapper ---

export default function UserManagementDetail() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();

  const [profileData, setProfileData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('Profile');

  useEffect(() => {
    fetchUserProfile(userId).then(setProfileData).catch(() => router.push('/admin/users'));
  }, [userId, router]);

  if (!profileData) return <div style={{ color: '#fff' }}>Loading identity...</div>;

  const profile = profileData.profile;

  const tabs = ['Profile', 'Subscriptions', 'Workspaces', 'API Keys', 'Files', 'Conversations', 'Payments', 'Activity'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Container */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
        <button onClick={() => router.push('/admin/users')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px' }}>
          ←
        </button>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #7c6df0, #f87171)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold' }}>
          {profile.full_name?.charAt(0) || 'U'}
        </div>
        <div>
          <h1 style={{ fontSize: '28px', margin: '0 0 4px 0' }}>{profile.full_name || 'Unnamed User'}</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>{profile.email} • ID: {profile.user_id}</p>
        </div>
      </div>

      {/* Nav Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            style={{ 
              padding: '8px 16px', background: activeTab === tab ? '#fff' : 'transparent', 
              color: activeTab === tab ? '#000' : 'rgba(255,255,255,0.7)', 
              border: activeTab === tab ? 'none' : '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '24px', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Render Portals */}
      <div>
        {activeTab === 'Profile' && <ProfileTab userId={userId} profile={profile} />}
        {activeTab === 'Subscriptions' && <SubscriptionsTab userId={userId} />}
        {activeTab === 'Workspaces' && <WorkspacesTab userId={userId} />}
        {activeTab === 'API Keys' && <ApiKeysTab userId={userId} />}
        {activeTab === 'Files' && <FilesTab userId={userId} />}
        {activeTab === 'Conversations' && <ConversationsTab userId={userId} />}
        {activeTab === 'Payments' && <PaymentsTab userId={userId} />}
        {activeTab === 'Activity' && <ActivityTab userId={userId} />}
      </div>
      
    </div>
  );
}
