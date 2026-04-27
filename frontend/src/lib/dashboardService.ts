import api from './api';

export interface UserOverview {
  status: string;
  profile: {
    full_name: string;
    email: string;
    company_name: string;
    subscription_plan: string;
    member_since: string;
    last_login: string;
  };
  workspace_stats: { total: number; active: number };
  usage_summary: {
    documents: { used: number; limit: number; percentage: number };
    queries:   { used: number; limit: number; percentage: number };
    api_calls: { used: number; limit: number; percentage: number };
    tokens:    { used: number; limit: number; percentage: number };
    workspaces:{ used: number; limit: number; percentage: number };
  };
}

export interface WorkspaceUsage {
  workspace_name: string;
  status: string;
  created_at: string;
  file_count: number;
  usage: {
    uploads:   { used: number; limit: number; percentage: number };
    api_calls: { used: number; limit: number; percentage: number };
  };
}

/** GET /dashboard/user/overview/{user_id} */
export async function fetchUserOverview(userId: string): Promise<UserOverview> {
  const res = await api.get(`/dashboard/user/overview/${userId}`);
  return res.data;
}

/** GET /dashboard/user/workspace_usage/{user_id} */
export async function fetchWorkspaceUsage(userId: string): Promise<WorkspaceUsage[]> {
  const res = await api.get(`/dashboard/user/workspace_usage/${userId}`);
  return res.data.workspaces ?? [];
}
