import api from './api';

export interface DocumentRecord {
  doc_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_extension: string;
  uploaded_at: string;
  workspace_name: string;
  user_id: string;
  file_size: number;
  file_description: string;
  status: string;
}

/** POST /file/upload_file */
export async function uploadFile(
  userId: string,
  workspaceName: string,
  description: string,
  file: File
): Promise<{ status: string; message: string; document_id: string; file_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await api.post('/file/upload_file', formData, {
    params: { 
      user_id: userId, 
      workspace_name: workspaceName, 
      description 
    },
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
}

/** GET /file/get_file_by_workspace/{workspace_name} */
export async function fetchFilesByWorkspace(workspaceName: string): Promise<DocumentRecord[]> {
  const res = await api.get(`/file/get_file_by_workspace/${workspaceName}`);
  return res.data.files ?? [];
}

/** GET /file/delete_file/{doc_id} */
export async function deleteFile(docId: string): Promise<{ status: string; message: string }> {
  // Using GET since the backend router uses @router.get("/delete_file/{doc_id}")
  const res = await api.get(`/file/delete_file/${docId}`);
  return res.data;
}

/** GET /file/get-file-by-Id/{doc_id} */
export async function fetchFileById(docId: string): Promise<DocumentRecord> {
  const res = await api.get(`/file/get-file-by-Id/${docId}`);
  return res.data.file;
}
