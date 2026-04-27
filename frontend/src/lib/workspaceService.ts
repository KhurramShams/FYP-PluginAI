import api from './api';

export interface Workspace {
  id?: string;
  workspace_name: string;
  status: string;
  created_at: string;
  file_count?: number;
}

/** POST /workspace/create_workspace */
export async function createWorkspace(userId: string, workspaceName: string): Promise<{ status: string; message: string }> {
  const res = await api.post('/workspace/create_workspace', null, {
    params: { user_id: userId, workspace_name: workspaceName },
  });
  return res.data;
}

/** GET /workspace/get_all_workspaces */
export async function fetchAllWorkspaces(userId: string): Promise<Workspace[]> {
  const res = await api.get('/workspace/get_all_workspaces', { params: { user_id: userId } });
  return res.data.workspaces ?? [];
}

/** GET /workspace/get_workspace/{workspace_name} */
export async function fetchWorkspaceDetails(workspaceName: string): Promise<Workspace> {
  const res = await api.get(`/workspace/get_workspace/${workspaceName}`);
  return res.data['Workspace Details'];
}

/** GET /workspace/delete_workspace/{workspace_name} */
export async function deleteWorkspace(workspaceName: string): Promise<{ status: string; message: string }> {
  const res = await api.get(`/workspace/delete_workspace/${workspaceName}`);
  return res.data;
}

export interface WorkspaceUsageRecord {
  workspace_name: string;
  max_upload: number;
  user_upload: number;
  user_api: number;
  max_api: number;
  user_token: number;
  max_token: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/** GET /workspace/workspace_usage/{workspace_name} */
export async function fetchWorkspaceUsageDetails(workspaceName: string): Promise<WorkspaceUsageRecord> {
  const res = await api.get(`/workspace/workspace_usage/${workspaceName}`);
  return res.data['Workspace Usage'];
}
