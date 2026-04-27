import React from 'react';

export function DemoChat() {
  return (
    <section className="demo-section">
      <div className="demo-container">
        <div className="demo-text">
          <div className="section-tag">Live demo</div>
          <h2 className="section-title" style={{ fontSize: '32px' }}>See it in action</h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8, marginBottom: '24px' }}>
            Ask questions in natural language. The agent searches your documents, reruns queries if needed, and returns accurate answers with source references.
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
              <div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>
              Multi-step reasoning across documents
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
              <div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>
              Cites page number and section title
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
              <div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>
              Handles tables, lists, and mixed content
            </li>
          </ul>
        </div>
        
        <div className="demo-chat">
          <div className="chat-header">
            <div className="chat-dot"></div>
            <span className="chat-title">Plugin AI — Workspace: Sukkur IBA Docs</span>
          </div>
          <div className="chat-messages">
            <div className="msg msg-user">What graduate programs are available and how long do they take?</div>
            <div className="msg msg-ai">
              <strong>Based on your documents:</strong><br/><br/>
              Sukkur IBA offers the following graduate programs, all 2 years in duration:<br/><br/>
              • MBA — Marketing, HRM, Finance<br/>
              • MS Computer Science — CS, Software Engineering<br/>
              • M.Phil Education<br/>
              • ME Electrical Engineering — 4 specializations<br/>
              • Management Science, Mathematics<br/><br/>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Source: Page 1 | Section: Graduate Programs</span>
            </div>
            <div className="msg msg-user">What are the admission criteria?</div>
            <div className="msg msg-ai">
              <strong>Admissions are based on:</strong> academic criteria, test results, and interview performance. The institute provides detailed information through publications and their website.<br/><br/>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Source: Page 1 | Section: Graduate Programs</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
