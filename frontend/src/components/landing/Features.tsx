import React from 'react';
import { Card } from '../ui/Card';

export function Features() {
  return (
    <section className="section">
      <div className="section-tag">Features</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px', marginBottom: '56px' }}>
        <div>
          <h2 className="section-title">Everything you need<br/>to build AI assistants</h2>
        </div>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.45)', maxWidth: '380px', lineHeight: 1.7 }}>
          From document ingestion to intelligent retrieval — Plugin AI handles the full pipeline so you can focus on your product.
        </p>
      </div>
      
      <div className="features-grid">
        <Card className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <h3>Multi-format ingestion</h3>
          <p>Upload PDF, Word, Excel, and plain text files. Smart chunking preserves tables, lists, and section structure automatically.</p>
        </Card>

        <Card className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3>Agentic RAG retrieval</h3>
          <p>Our AI agent uses multiple tools to search, rerank, and synthesize answers — retrying with different strategies until it finds the best result.</p>
        </Card>

        <Card className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </div>
          <h3>Multi-tenant workspaces</h3>
          <p>Each organization gets isolated workspaces with their own data, API keys, usage limits, and subscription plans.</p>
        </Card>

        <Card className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <h3>Real-time usage tracking</h3>
          <p>Monitor token consumption, query counts, and document uploads per workspace. Get monthly usage reports via email.</p>
        </Card>

        <Card className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </div>
          <h3>REST API access</h3>
          <p>Integrate your AI assistant into any application using our simple REST API. Each workspace gets its own API key.</p>
        </Card>

        <Card className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3>Enterprise security</h3>
          <p>Row-level security, API key management, activity logging, and per-user access controls built in from day one.</p>
        </Card>
      </div>
    </section>
  );
}
