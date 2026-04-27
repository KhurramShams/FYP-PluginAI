import React from 'react';
import { Button } from '../ui/Button';

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-badge">
        <div className="hero-badge-dot"></div> Now with Agentic RAG — smarter, multi-step answers
      </div>
      <h1>Your AI assistant<br/>powered by <span>your data</span></h1>
      <p>Upload your documents, build AI workspaces, and deploy intelligent support assistants — all in minutes. No ML expertise required.</p>
      <div className="hero-actions">
        <Button className="btn-hero btn-hero-primary" variant="primary">Start for free</Button>
        <Button className="btn-hero btn-hero-secondary" variant="ghost">View live demo</Button>
      </div>
    </section>
  );
}
