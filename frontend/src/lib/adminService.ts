import adminApi from './adminApi';

export interface AdminSystemHealth {
  status: string;
  timestamp: string;
  services: any;
  platform: {
    total_users: number;
    total_workspaces: number;
    total_documents: number;
  };
}

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  company_name: string | null;
  subscription_plan: string;
  created_at: string;
  last_login: string | null;
  two_fa_enabled: boolean;
}

export interface AdminUsersResponse {
  status: string;
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

/** GET /admin/health */
export async function fetchSystemHealth(): Promise<AdminSystemHealth> {
  const res = await adminApi.get('/admin/health');
  return res.data;
}

/** GET /admin/users */
export async function fetchAllUsers(limit = 20, offset = 0, search = ''): Promise<AdminUsersResponse> {
  const res = await adminApi.get('/admin/users', { params: { limit, offset, search } });
  return res.data;
}

/** DELETE /admin/cache/embeddings */
export async function flushEmbeddingCache() {
  const res = await adminApi.delete('/admin/cache/embeddings');
  return res.data;
}

/** DELETE /admin/cache/conversations */
export async function flushConversationCache() {
  const res = await adminApi.delete('/admin/cache/conversations');
  return res.data;
}

/** Users table functions can be extended with suspend/delete per backend paths */

export async function fetchUserProfile(userId: string) { return (await adminApi.get(`/admin/users/${userId}/profile`)).data; }
export async function fetchUserSubscriptions(userId: string) { return (await adminApi.get(`/admin/users/${userId}/subscriptions`)).data; }
export async function fetchUserWorkspaces(userId: string) { return (await adminApi.get(`/admin/users/${userId}/workspaces`)).data; }
export async function fetchUserApiKeys(userId: string) { return (await adminApi.get(`/admin/users/${userId}/api_keys`)).data; }
export async function fetchUserFiles(userId: string) { return (await adminApi.get(`/admin/users/${userId}/files`)).data; }
export async function fetchUserConversations(userId: string) { return (await adminApi.get(`/admin/users/${userId}/conversations`)).data; }
export async function fetchUserPayments(userId: string) { return (await adminApi.get(`/admin/users/${userId}/payments`)).data; }
export async function fetchUserActivity(userId: string) { return (await adminApi.get(`/admin/users/${userId}/activity`)).data; }

export async function suspendUser(userId: string, reason: string) { return (await adminApi.post('/admin/users/suspend', { user_id: userId, reason })).data; }
export async function unsuspendUser(userId: string) { return (await adminApi.post(`/admin/users/unsuspend/${userId}`)).data; }
export async function deleteUserAccount(userId: string) { return (await adminApi.delete(`/admin/users/${userId}`)).data; }

/** Workspace Management hooks — all use GET /admin/workspaces (correct route) */
export async function fetchAllWorkspaces(limit = 20, offset = 0, search = '', status = '') {
  return (await adminApi.get('/admin/workspaces', { params: { limit, offset, search: search || undefined, status: status || undefined } })).data;
}
export async function fetchWorkspaceDetail(workspaceName: string) { return (await adminApi.get(`/admin/workspaces/${workspaceName}`)).data; }
export async function fetchWorkspaceFiles(workspaceName: string) { return (await adminApi.get(`/admin/workspaces/${workspaceName}/files`)).data; }
export async function fetchWorkspaceConversations(workspaceName: string) { return (await adminApi.get(`/admin/workspaces/${workspaceName}/conversations`)).data; }
export async function fetchWorkspaceApiKeys(workspaceName: string) { return (await adminApi.get(`/admin/workspaces/${workspaceName}/api_keys`)).data; }
export async function fetchWorkspaceActivity(workspaceName: string) { return (await adminApi.get(`/admin/workspaces/${workspaceName}/activity`)).data; }
export async function fetchWorkspaceAnalytics(workspaceName: string) { return (await adminApi.get(`/admin/workspaces/${workspaceName}/analytics`)).data; }

export async function toggleWorkspaceStatus(workspaceName: string, status: 'active' | 'inactive') { return (await adminApi.patch(`/admin/workspaces/${workspaceName}/status`, null, { params: { status } })).data; }
export async function suspendWorkspace(workspaceName: string) { return toggleWorkspaceStatus(workspaceName, 'inactive'); }
export async function activateWorkspace(workspaceName: string) { return toggleWorkspaceStatus(workspaceName, 'active'); }
export async function deleteWorkspace(workspaceName: string) { return (await adminApi.delete(`/admin/workspaces/${workspaceName}`)).data; }

/** Subscription admin hooks */
export async function fetchAllSubscriptions(limit = 20, offset = 0) { return (await adminApi.get('/admin/subscriptions', { params: { limit, offset } })).data; }
export async function fetchAllPlans() { return (await adminApi.get('/admin/plans')).data; }
export async function updateUserPlan(userId: string, newPlan: string) { return (await adminApi.put('/admin/subscriptions/plan', { user_id: userId, new_plan: newPlan })).data; }
export async function updateSubscriptionQuota(subscriptionId: string, quotas: Record<string, number>) { return (await adminApi.put('/admin/subscriptions/quota', { subscription_id: subscriptionId, ...quotas })).data; }
export async function extendSubscription(subscriptionId: string, days: number) { return (await adminApi.post('/admin/subscriptions/extend', { subscription_id: subscriptionId, days })).data; }
export async function cancelSubscriptionAdmin(subscriptionId: string) { return (await adminApi.post(`/admin/subscriptions/cancel/${subscriptionId}`)).data; }
export async function resetSubscriptionUsage(subscriptionId: string) { return (await adminApi.post(`/admin/subscriptions/reset_usage/${subscriptionId}`)).data; }

/** Analytics admin hooks */
export async function fetchAnalyticsOverview(days = 30) { return (await adminApi.get('/admin/analytics/overview', { params: { days } })).data; }
export async function fetchApiUsage(days = 30) { return (await adminApi.get('/admin/analytics/api-usage', { params: { days } })).data; }
export async function fetchTokenUsage(days = 30) { return (await adminApi.get('/admin/analytics/token-usage', { params: { days } })).data; }
export async function fetchConversationStats(days = 30) { return (await adminApi.get('/admin/analytics/conversation-stats', { params: { days } })).data; }
export async function fetchTopWorkspaces(limit = 10) { return (await adminApi.get('/admin/analytics/top-workspaces', { params: { limit } })).data; }
export async function fetchTopUsersByMetric(metric: string, limit = 10) { return (await adminApi.get('/admin/analytics/top_users', { params: { metric, limit } })).data; }
export async function fetchSystemHealthAnalytics() { return (await adminApi.get('/admin/analytics/system-health')).data; }
export async function fetchActivityFeed(limit = 20) { return (await adminApi.get('/admin/analytics/activity-feed', { params: { limit } })).data; }
