'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

import { useWorkspaceStore } from '@/store/workspaceStore';

export default function SandboxPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string, source?: string}[]>([
    { role: 'ai', content: 'Hello! I am connected to your Workspace. Ask me anything about the uploaded documents.' }
  ]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading || !activeWorkspace?.name) return;

    const userQuery = query.trim();
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setQuery('');
    setLoading(true);

    try {
      // Replaced old `/agent/query` route with the production portal route
      const response = await api.post('/v1/web/query/portal_query', {
        query: userQuery,
        workspace_name: activeWorkspace.name,
        unique_id: `session-${Date.now()}` // Generate temporary unique session
      });

      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: response.data?.respons || response.data?.answer || 'Received empty response.',
        source: response.data?.status === 'no_data' ? 'No exact context found in vector storage.' : `Response Time: ${response.data?.response_time_seconds || 0}s`
      }]);

    } catch (err: any) {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: `Error: ${err.response?.data?.detail || err.message}` 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Agent Sandbox</h1>
        <p>Test your assistant's responses and reasoning capabilities in real-time.</p>
      </div>

      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        
        {/* Chat History Header */}
        <div style={{ padding: '20px 24px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeWorkspace ? '#22c55e' : '#ef4444' }}></div>
            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>Active Workspace: {activeWorkspace?.name || 'Please select a workspace'}</span>
          </div>
        </div>

        {/* Message Thread */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
              <div style={{ 
                padding: '14px 18px', 
                borderRadius: '12px', 
                fontSize: '14px', 
                lineHeight: 1.6,
                background: msg.role === 'user' ? 'rgba(124, 109, 240, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: msg.role === 'user' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.8)',
                border: msg.role === 'user' ? '0.5px solid rgba(124, 109, 240, 0.2)' : '0.5px solid rgba(255, 255, 255, 0.08)'
              }}>
                {msg.content}
              </div>
              {msg.source && (
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '6px', marginLeft: '4px' }}>
                  {msg.source}
                </div>
              )}
            </div>
          ))}
          {loading && (
             <div style={{ alignSelf: 'flex-start', padding: '14px 18px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255,255,255,0.4)', border: '0.5px solid rgba(255, 255, 255, 0.08)' }}>
                Agent is thinking...
             </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input Form */}
        <div style={{ padding: '20px 24px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text" 
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask a question about the active workspace..."
              disabled={loading}
              style={{ 
                flex: 1, padding: '14px 18px', background: 'rgba(255,255,255,0.03)', 
                border: '0.5px solid rgba(255,255,255,0.1)', color: '#fff', 
                borderRadius: '10px', fontSize: '14px', outline: 'none' 
              }} 
            />
            <Button type="submit" variant="primary" style={{ padding: '0 24px' }} disabled={loading}>
              Send
            </Button>
          </form>
        </div>

      </Card>
    </div>
  );
}
