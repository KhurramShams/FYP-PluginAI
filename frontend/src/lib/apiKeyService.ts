import api from './api';

export interface ApiKey {
  id?: string;
  api_key: string;
  masked_key?: string;
  workspace_name: string;
  status: 'active' | 'inactive';
  created_at: string;
  last_used?: string;
}

/** GET /api-keys/generate_api_key */
export async function generateApiKey(userId: string, workspaceName: string): Promise<{ api_key: string }> {
  const res = await api.get('/api-keys/generate_api_key', {
    params: { user_id: userId, workspace_name: workspaceName },
  });
  return res.data;
}

/** GET /api-keys/get_all_api */
export async function fetchAllApiKeys(userId: string): Promise<ApiKey[]> {
  const res = await api.get('/api-keys/get_all_api', { params: { user_id: userId } });
  return res.data.api_keys ?? [];
}

/** GET /api-keys/get_workspace_api/{workspace_name} */
export async function fetchWorkspaceApiKeys(userId: string, workspaceName: string): Promise<ApiKey[]> {
  const res = await api.get(`/api-keys/get_workspace_api/${workspaceName}`, { params: { user_id: userId } });
  return res.data.api_keys ?? [];
}

/** GET /api-keys/delete_api_key */
export async function deleteApiKey(userId: string, apiKey: string): Promise<void> {
  await api.get('/api-keys/delete_api_key', { params: { user_id: userId, api_key: apiKey } });
}

export interface ApiUsageData {
  avg_latency_ms: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  user_token: number;
  max_token: number;
}

/** POST /track/api_usage */
export async function fetchApiUsage(apiKey: string, workspaceName: string): Promise<ApiUsageData> {
  // Usage backend expects fastAPI query params
  const res = await api.post('/track/api_usage', {}, { 
    params: { api_key: apiKey, workspace: workspaceName } 
  });
  return res.data.api_usage_data;
}
