'use client';
import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { flushEmbeddingCache, flushConversationCache } from '@/lib/adminService';
import { Button } from '@/components/ui/Button';

export default function AdminAnalyticsPage() {
  const [clearing, setClearing] = useState(false);

  const handleFlush = async (type: 'emb' | 'conv') => {
    if (!confirm(`Are you sure you want to completely flush the ${type} cache?`)) return;
    setClearing(true);
    try {
      if (type === 'emb') await flushEmbeddingCache();
      else await flushConversationCache();
      alert('Cache flushed successfully.');
    } catch (e: any) {
      alert('Error: ' + e?.message);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '28px', margin: '0 0 8px 0' }}>System Analytics & Cache</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Review system latency, payload volumes, and manage Redis data stores.</p>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <Card style={{ padding: '24px', flex: 1, textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Embedding RAG Cache</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '24px' }}>
            Pinecone inference caching mapped via Redis. Purging this forces the LLM context to refetch documents from DB limits.
          </p>
          <Button variant="outline" onClick={() => handleFlush('emb')} disabled={clearing} style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
             Flush Embedding Cache
          </Button>
        </Card>

        <Card style={{ padding: '24px', flex: 1, textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Conversation Log Cache</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '24px' }}>
            Temporary historical chat logs. Managed in Redis before async sync to Postgres.
          </p>
          <Button variant="outline" onClick={() => handleFlush('conv')} disabled={clearing} style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
             Flush Conversation Cache
          </Button>
        </Card>
      </div>
    </div>
  );
}
