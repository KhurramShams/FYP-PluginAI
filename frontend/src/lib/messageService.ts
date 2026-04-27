import api from './api';

export interface Conversation {
  conversation_id: string;
  workspace_name: string;
  source_type: string;
  api_key_id: string;
  created_at: string;
}

export interface Message {
  message_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  last_used: string;
}

export interface ConversationStats {
  total_messages: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  avg_latency_ms: number;
}

/** GET /data-msg/conversations?workspace={workspace_name} */
export async function fetchConversations(workspaceName: string): Promise<Conversation[]> {
  const res = await api.get('/data-msg/conversations', {
    params: { workspace: workspaceName },
  });
  return res.data.conversations || [];
}

/** GET /data-msg/conversations/{conversation_id}/messages */
export async function fetchConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await api.get(`/data-msg/conversations/${conversationId}/messages`);
  return res.data.messages || [];
}

/** GET /data-msg/conversations/{conversation_id}/stats */
export async function fetchConversationStats(conversationId: string): Promise<ConversationStats> {
  const res = await api.get(`/data-msg/conversations/${conversationId}/stats`);
  return res.data.stats;
}
