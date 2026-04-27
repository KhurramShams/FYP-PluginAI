'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { 
  fetchConversations, fetchConversationMessages, fetchConversationStats, 
  Conversation, Message, ConversationStats 
} from '@/lib/messageService';
import { 
  MessageSquare, Server, Cpu, Activity, Clock, Search, 
  Copy, CheckCircle2, ChevronRight, Zap
} from 'lucide-react';
import { extractErrorMessage } from '@/lib/authService';

const THEME = {
  primary: '#7c6df0',
  bgCard: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  textMuted: 'rgba(255,255,255,0.45)',
  userBubble: 'rgba(124,109,240,0.15)',
  agentBubble: 'rgba(255,255,255,0.05)'
};

// ── Shared UI Utilities ────────────────────────────────────────────────────────

function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <div style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, minWidth: '140px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: THEME.textMuted, fontWeight: 500 }}>{title}</span>
        <div style={{ color }}>{icon}</div>
      </div>
      <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{value}</span>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system' || msg.role?.toLowerCase().includes('system');
  const isAssistant = msg.role === 'assistant';

  let displayContent = msg.content;
  try {
    // Some backend frameworks dump dicts with single quotes instead of valid JSON
    let parseTarget = msg.content;
    if (parseTarget.trim().startsWith('{')) {
      const parsed = JSON.parse(parseTarget.replace(/'/g, '"'));
      if (typeof parsed === 'object' && parsed !== null) {
        displayContent = parsed.system_instruction || parsed.content || parsed.response || parsed.text || parsed.message || parsed.answer || displayContent;
      }
    }
  } catch (e) {
    // Regex fallback if JSON parse fails
    const match = msg.content.match(/['"](?:system_instruction|content|response|text|message)['"]\s*:\s*['"]((?:\\.|[^"'\\])*)['"]/i);
    if (match && match[1]) {
      displayContent = match[1];
    }
  }

  const copyText = () => {
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', margin: '16px 0' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', padding: '0 4px' }}>
        <span style={{ fontSize: '11px', color: THEME.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>
          {isUser ? 'User' : isSystem ? 'System Instruction' : 'AI Agent'}
        </span>
        {isAssistant && msg.latency_ms > 0 && (
          <span style={{ fontSize: '10px', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{msg.latency_ms}ms</span>
        )}
      </div>

      <div style={{
          position: 'relative',
          maxWidth: '85%',
          background: isUser ? THEME.userBubble : THEME.agentBubble,
          border: `1px solid ${isUser ? 'rgba(124,109,240,0.3)' : THEME.border}`,
          borderRadius: '12px',
          padding: '16px',
          color: '#e2e8f0',
          fontSize: '14px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          borderBottomRightRadius: isUser ? '4px' : '12px',
          borderBottomLeftRadius: isUser ? '12px' : '4px',
      }}>
        {displayContent}
        {isAssistant && (
          <button 
            onClick={copyText} 
            style={{ position: 'absolute', top: '8px', right: '8px', padding: '6px', background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '6px', color: THEME.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s', opacity: 0.6 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
            title="Copy payload"
          >
            {copied ? <CheckCircle2 size={14} color="#22c55e" /> : <Copy size={14} />}
          </button>
        )}
      </div>

      {isAssistant && (
         <div style={{ display: 'flex', gap: '12px', marginTop: '6px', padding: '0 4px' }}>
           <span style={{ fontSize: '10px', color: THEME.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}><Cpu size={10}/> P: {msg.prompt_tokens}</span>
           <span style={{ fontSize: '10px', color: THEME.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}><Zap size={10}/> C: {msg.completion_tokens}</span>
         </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatHistoryPage() {
  const { ready } = useAuth();
  const { activeWorkspace } = useWorkspaceStore();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !activeWorkspace) return;
    const fetchConvos = async () => {
      setLoadingConvos(true);
      setError('');
      try {
        const data = await fetchConversations(activeWorkspace.name);
        setConversations(data);
        if (data.length > 0) setSelectedConvo(data[0]); // auto select first
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to resolve historical connections.'));
      } finally {
        setLoadingConvos(false);
      }
    };
    fetchConvos();
  }, [ready, activeWorkspace]);

  useEffect(() => {
    if (!selectedConvo) {
      setMessages([]); setStats(null); return; 
    }
    
    let active = true;
    const loadDetails = async () => {
      setLoadingMessages(true);
      try {
        const [msgs, stts] = await Promise.all([
          fetchConversationMessages(selectedConvo.conversation_id),
          fetchConversationStats(selectedConvo.conversation_id)
        ]);
        if (active) {
          setMessages(msgs);
          setStats(stts);
          // scroll to bottom after layout shift
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      } catch (err: any) {
         console.error('Failed fetching convo details:', err);
      } finally {
        if (active) setLoadingMessages(false);
      }
    };
    loadDetails();

    return () => { active = false; };
  }, [selectedConvo]);

  const filteredConvos = conversations.filter(c => 
    c.conversation_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.source_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 40px)', background: '#0a0a0f', margin: '-20px' }}>
       
      {/* ── Left Panel: Conversations List ── */}
      <div style={{ width: '320px', borderRight: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column', background: 'rgba(10,10,15,0.95)' }}>
        <div style={{ padding: '24px', borderBottom: `1px solid ${THEME.border}` }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><MessageSquare size={18} color={THEME.primary}/> Message History</h2>
          
          <div style={{ position: 'relative' }}>
             <Search size={16} color={THEME.textMuted} style={{ position: 'absolute', top: '10px', left: '12px' }} />
             <input 
               type="text" 
               placeholder="Search conversation..." 
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: '8px', color: '#fff', fontSize: '13px', outline: 'none' }}
             />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!activeWorkspace ? (
             <div style={{ padding: '32px 24px', textAlign: 'center', color: THEME.textMuted, fontSize: '13px' }}>Select an active workspace globally to inspect traffic logs.</div>
          ) : loadingConvos ? (
             <div style={{ padding: '32px 24px', textAlign: 'center', color: THEME.textMuted, fontSize: '13px', animation: 'pulse 1.5s infinite' }}>Mapping historical ledgers...</div>
          ) : filteredConvos.length === 0 ? (
             <div style={{ padding: '32px 24px', textAlign: 'center', color: THEME.textMuted, fontSize: '13px' }}>No conversations yield match constraints.</div>
          ) : (
             filteredConvos.map(cv => (
               <div 
                 key={cv.conversation_id}
                 onClick={() => setSelectedConvo(cv)}
                 style={{ 
                   padding: '16px 24px', borderBottom: `1px solid ${THEME.border}`, cursor: 'pointer',
                   background: selectedConvo?.conversation_id === cv.conversation_id ? 'rgba(124,109,240,0.08)' : 'transparent',
                   borderLeft: `2px solid ${selectedConvo?.conversation_id === cv.conversation_id ? THEME.primary : 'transparent'}`,
                   transition: 'background 0.2s', display: 'flex', flexDirection: 'column'
                 }}
                 onMouseEnter={e => { if (selectedConvo?.conversation_id !== cv.conversation_id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                 onMouseLeave={e => { if (selectedConvo?.conversation_id !== cv.conversation_id) e.currentTarget.style.background = 'transparent' }}
               >
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <code style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>{cv.conversation_id.substring(0, 10)}...</code>
                    <span style={{ fontSize: '10px', background: cv.source_type.toLowerCase() === 'portal' ? 'rgba(59,130,246,0.15)' : 'rgba(249,115,22,0.15)', color: cv.source_type.toLowerCase() === 'portal' ? '#3b82f6' : '#f97316', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, textTransform: 'uppercase' }}>
                      {cv.source_type}
                    </span>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: THEME.textMuted, fontSize: '11px' }}>
                    <Clock size={12}/> {new Date(cv.created_at).toLocaleString()}
                 </div>
               </div>
             ))
          )}
        </div>
      </div>

      {/* ── Right Panel: Chat Viewer & Stats ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
         
         {!activeWorkspace || !selectedConvo ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
               <Server size={32} color={THEME.textMuted} style={{ opacity: 0.5 }} />
               <h3 style={{ fontSize: '18px', color: '#fff' }}>AI Engagement Observatory</h3>
               <span style={{ color: THEME.textMuted, fontSize: '14px' }}>Select an identity flow from the left to map token output sequences.</span>
            </div>
         ) : (
            <>
              {/* Stats Header */}
              <div style={{ padding: '24px', borderBottom: `1px solid ${THEME.border}`, background: 'rgba(10,10,15,0.95)' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: THEME.textMuted }}>Conversation Tree</span>
                    <ChevronRight size={14} color={THEME.textMuted}/>
                    <code style={{ fontSize: '14px', color: '#fff' }}>{selectedConvo.conversation_id}</code>
                 </div>
                 
                 <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                   {stats ? (
                     <>
                       <StatCard title="Transactions" value={stats.total_messages} icon={<MessageSquare size={16}/>} color={THEME.primary} />
                       <StatCard title="Prompt Demand" value={stats.total_prompt_tokens.toLocaleString()} icon={<Cpu size={16}/>} color="#3b82f6" />
                       <StatCard title="Completion Yield" value={stats.total_completion_tokens.toLocaleString()} icon={<CheckCircle2 size={16}/>} color="#22c55e" />
                       <StatCard title="Reaction Speed" value={`${stats.avg_latency_ms} ms`} icon={<Activity size={16}/>} color="#f97316" />
                     </>
                   ) : (
                     <div style={{ color: THEME.textMuted, fontSize: '13px', display: 'flex', alignItems: 'center', height: '80px', animation: 'pulse 1.5s infinite' }}>Compiling node analytics...</div>
                   )}
                 </div>
              </div>

              {/* Message Payload Render Container */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                 {loadingMessages ? (
                    <div style={{ textAlign: 'center', color: THEME.textMuted, fontSize: '13px', marginTop: '40px', animation: 'pulse 1.5s infinite' }}>Extracting sequence chunks...</div>
                 ) : messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: THEME.textMuted, fontSize: '13px', marginTop: '40px' }}>No payloads discovered in this interaction bound.</div>
                 ) : (
                    <div>
                      {messages.map(msg => <MessageBubble key={msg.message_id} msg={msg} />)}
                      <div ref={chatEndRef} />
                    </div>
                 )}
              </div>
            </>
         )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}}/>
    </div>
  );
}
