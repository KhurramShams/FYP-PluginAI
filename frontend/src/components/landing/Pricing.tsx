import React from 'react';

export function Pricing() {
  return (
    <section className="section" style={{ paddingTop: '20px' }}>
      <div className="section-tag">Pricing</div>
      <h2 className="section-title">Simple, transparent pricing</h2>
      <p className="section-sub">Start for free. Scale as you grow. No hidden fees.</p>
      
      <div className="pricing-grid">
        <div className="plan-card">
          <div className="plan-name">Free</div>
          <div className="plan-price">$0<span>/mo</span></div>
          <div className="plan-desc">Perfect for individuals and small projects.</div>
          <ul className="plan-features">
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>1 workspace</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>10 documents</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>100 queries/month</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>Community support</li>
          </ul>
          <button className="plan-btn plan-btn-outline">Get started free</button>
        </div>

        <div className="plan-card featured">
          <div className="plan-badge">Most popular</div>
          <div className="plan-name">Pro</div>
          <div className="plan-price">$29<span>/mo</span></div>
          <div className="plan-desc">For growing teams and businesses.</div>
          <ul className="plan-features">
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>5 workspaces</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>100 documents</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>10,000 queries/month</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>API access</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>Priority support</li>
          </ul>
          <button className="plan-btn plan-btn-filled">Start Pro trial</button>
        </div>

        <div className="plan-card">
          <div className="plan-name">Enterprise</div>
          <div className="plan-price">Custom</div>
          <div className="plan-desc">For large organizations with custom needs.</div>
          <ul className="plan-features">
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>Unlimited workspaces</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>Unlimited documents</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>Custom token limits</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>SSO & advanced security</li>
            <li><div className="check"><svg viewBox="0 0 10 10"><polyline points="2,5 4,7 8,3"/></svg></div>Dedicated support</li>
          </ul>
          <button className="plan-btn plan-btn-outline">Contact sales</button>
        </div>
      </div>
    </section>
  );
}
