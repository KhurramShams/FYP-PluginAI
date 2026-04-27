'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { 
  uploadFile, deleteFile, fetchFilesByWorkspace, DocumentRecord 
} from '@/lib/fileService';
import { FileText, File, UploadCloud, Trash2, Download, Search, Info, X } from 'lucide-react';
import { extractErrorMessage } from '@/lib/authService';

const THEME = {
  primary: '#7c6df0',
  primaryHover: '#5e4ecf',
  bgCard: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  textMain: '#fff',
  textMuted: 'rgba(255,255,255,0.45)',
  danger: '#ef4444',
  success: '#22c55e',
};

// Utility to format sizes
function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getIconForFormat(extension: string) {
  if (extension === 'pdf') return <FileText color="#f87171" />;
  if (extension === 'txt') return <FileText color="#60a5fa" />;
  if (extension === 'docx') return <File color="#3b82f6" />;
  return <File color={THEME.textMuted} />;
}

export default function FilesPage() {
  const { user, ready } = useAuth();
  const { activeWorkspace } = useWorkspaceStore();

  const [files, setFiles] = useState<DocumentRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');

  // Upload State
  const [dragActive, setDragActive] = useState(false);
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success'|'error', msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [viewDetails, setViewDetails] = useState<DocumentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!activeWorkspace?.name) {
      setFiles([]);
      return;
    }
    setLoadingList(true); setError('');
    try {
      const data = await fetchFilesByWorkspace(activeWorkspace.name);
      setFiles(data);
    } catch (err: any) {
      setError('Failed to load files: ' + extractErrorMessage(err));
    } finally {
      setLoadingList(false);
    }
  }, [activeWorkspace?.name]);

  useEffect(() => {
    if (ready) loadFiles();
  }, [ready, loadFiles]);

  // ── Drag and Drop Logic ──────────────────────────────────────────
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (f: File) => {
    setUploadStatus(null);
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'txt', 'docx'].includes(ext ?? '')) {
      setUploadStatus({ type: 'error', msg: 'Invalid format. Only PDF, TXT, and DOCX are allowed.' });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadStatus({ type: 'error', msg: 'File exceeds 10MB limit.' });
      return;
    }
    setUploadFileObj(f);
  };

  // ── Upload Execution ─────────────────────────────────────────────
  const doUpload = async () => {
    if (!uploadFileObj || !user?.user_id || !activeWorkspace?.name) return;
    setUploading(true); setUploadStatus(null);
    try {
      await uploadFile(user.user_id, activeWorkspace.name, description.trim() || 'No description provided', uploadFileObj);
      setUploadStatus({ type: 'success', msg: 'File successfully uploaded, chunked, and embedded.' });
      setUploadFileObj(null);
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadFiles();
    } catch (err: any) {
      setUploadStatus({ type: 'error', msg: extractErrorMessage(err, 'File upload failed.') });
    } finally {
      setUploading(false);
    }
  };

  // ── File Deletion ────────────────────────────────────────────────
  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this file? This will permanently remove its embeddings and storage data.')) return;
    setDeletingId(docId);
    try {
      await deleteFile(docId);
      loadFiles();
    } catch (err: any) {
      alert(extractErrorMessage(err, 'Failed to delete data.'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!activeWorkspace) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: THEME.textMuted }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
            <FileText size={48} color={THEME.textMuted} />
          </div>
        </div>
        <h2 style={{ fontSize: '24px', color: THEME.textMain, marginBottom: '8px' }}>No Workspace Selected</h2>
        <p style={{ fontSize: '14px' }}>Please select or create an active workspace from the sidebar to manage files.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1000px' }}>
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>File Management</h1>
        <p style={{ fontSize: '14px', color: THEME.textMuted, margin: 0 }}>
          Manage your RAG intelligence source data for <strong style={{ color: THEME.primary }}>{activeWorkspace.name}</strong>.
        </p>
      </div>

      {/* ── Upload Section ── */}
      <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '16px' }}>Ingest Knowledge</h3>
        
        <div 
          onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragActive ? THEME.primary : 'rgba(255,255,255,0.15)'}`,
            background: dragActive ? 'rgba(124,109,240,0.05)' : 'transparent',
            borderRadius: '12px', padding: '40px 24px', textAlign: 'center', transition: 'all 0.2s ease',
            cursor: 'pointer', marginBottom: '20px'
          }}
          onClick={(e) => { if ((e.target as any).tagName !== 'BUTTON') fileInputRef.current?.click(); }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx" onChange={handleFileChange} style={{ display: 'none' }} />
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div style={{ padding: '12px', background: 'rgba(124,109,240,0.1)', borderRadius: '50%', color: THEME.primary }}>
              <UploadCloud size={32} />
            </div>
          </div>
          <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
            {uploadFileObj ? uploadFileObj.name : 'Click or drag file to this area to upload'}
          </h4>
          <p style={{ fontSize: '13px', color: THEME.textMuted, margin: 0 }}>
             {uploadFileObj ? `Size: ${formatSize(uploadFileObj.size)}` : 'Support for a single or bulk upload. Max size 10MB (PDF, TXT, DOCX)'}
          </p>
        </div>

        {uploadFileObj && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input 
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this document contain? (Optional metadata for routing)"
              disabled={uploading}
              style={{
                width: '100%', padding: '14px', background: 'rgba(255,255,255,0.04)', 
                border: `1px solid ${THEME.border}`, borderRadius: '10px', 
                color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => { setUploadFileObj(null); setDescription(''); }} disabled={uploading} style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: '8px', color: THEME.textMuted, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doUpload} disabled={uploading} style={{ padding: '10px 20px', background: THEME.primary, border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: uploading ? 0.7 : 1 }}>
                {uploading ? <div style={{width:'16px',height:'16px',borderRadius:'50%',border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',animation:'spin 1s linear infinite'}}/> : <UploadCloud size={16} />}
                {uploading ? 'Chunking & Embedding...' : 'Upload Data'}
              </button>
            </div>
          </div>
        )}

        {uploadStatus && (
          <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px',
            background: uploadStatus.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            border: `1px solid ${uploadStatus.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: uploadStatus.type === 'error' ? THEME.danger : THEME.success
          }}>
            {uploadStatus.msg}
          </div>
        )}
      </div>

      {/* ── Files Table ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>Processed Documents</h3>
          <span style={{ fontSize: '13px', color: THEME.textMuted, background: THEME.bgCard, padding: '4px 12px', borderRadius: '12px', border: `1px solid ${THEME.border}` }}>
            {files.length} Files
          </span>
        </div>

        {error && <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', color: THEME.danger, borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

        <div style={{ overflowX: 'auto', background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${THEME.border}`, color: THEME.textMuted, background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '16px 20px', fontWeight: 500 }}>Filename</th>
                <th style={{ padding: '16px 20px', fontWeight: 500 }}>Size</th>
                <th style={{ padding: '16px 20px', fontWeight: 500 }}>Uploaded On</th>
                <th style={{ padding: '16px 20px', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '16px 20px', fontWeight: 500, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: THEME.textMuted }}>Syncing files...</td>
                </tr>
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: THEME.textMuted }}>
                    No documents have been uploaded to this workspace yet.
                  </td>
                </tr>
              ) : (
                files.map(f => (
                  <tr key={f.doc_id} style={{ borderBottom: `1px solid ${THEME.border}`, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {getIconForFormat(f.file_extension)}
                        <span style={{ color: '#fff', fontWeight: 500 }}>{f.file_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: THEME.textMuted }}>{formatSize(f.file_size)}</td>
                    <td style={{ padding: '16px 20px', color: THEME.textMuted }}>{new Date(f.uploaded_at).toLocaleString()}</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '12px', background: 'rgba(34,197,94,0.1)', color: THEME.success, border: '1px solid rgba(34,197,94,0.2)' }}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button onClick={() => setViewDetails(f)} style={{ padding: '8px', background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', borderRadius: '8px' }} title="View Info" onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <Info size={16} />
                        </button>
                        <a href={f.file_url} target="_blank" rel="noreferrer" style={{ padding: '8px', display: 'inline-flex', background: 'transparent', border: 'none', color: THEME.primary, cursor: 'pointer', borderRadius: '8px' }} title="Download Raw File" onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,109,240,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <Download size={16} />
                        </a>
                        <button onClick={() => handleDelete(f.doc_id)} disabled={deletingId === f.doc_id} style={{ padding: '8px', background: 'transparent', border: 'none', color: THEME.danger, cursor: deletingId === f.doc_id ? 'wait' : 'pointer', borderRadius: '8px' }} title="Delete Source" onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {deletingId === f.doc_id ? '...' : <Trash2 size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Details Modal ── */}
      {viewDetails && (
        <>
          <div onClick={() => setViewDetails(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#13131a', border: `1px solid ${THEME.border}`, borderRadius: '24px', padding: '32px', zIndex: 50, width: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'rgba(124,109,240,0.1)', borderRadius: '12px' }}>
                  {getIconForFormat(viewDetails.file_extension)}
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', wordBreak: 'break-all' }}>{viewDetails.file_name}</h2>
                  <p style={{ fontSize: '13px', color: THEME.textMuted }}>{formatSize(viewDetails.file_size)} • Uploaded {new Date(viewDetails.uploaded_at).toLocaleDateString()}</p>
                </div>
              </div>
              <button onClick={() => setViewDetails(null)} style={{ background: 'none', border: 'none', color: THEME.textMuted, cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ background: THEME.bgCard, borderRadius: '12px', padding: '16px', border: `1px solid ${THEME.border}`, marginBottom: '24px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Routing Description</h4>
              <p style={{ fontSize: '14px', color: THEME.textMuted, lineHeight: 1.5 }}>
                {viewDetails.file_description || 'No description provided at upload.'}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: THEME.textMuted }}>ID: {viewDetails.doc_id.split('-')[0]}...</span>
              <a href={viewDetails.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', padding: '10px 20px', background: THEME.primary, borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Download size={16} /> Open Document
              </a>
            </div>
          </div>
        </>
      )}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}}/>
    </div>
  );
}
