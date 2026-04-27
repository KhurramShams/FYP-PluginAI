import React from 'react';

export function Stats() {
  return (
    <div className="stats">
      <div className="stat">
        <div className="stat-num">10K+</div>
        <div className="stat-label">Documents processed</div>
      </div>
      <div className="stat">
        <div className="stat-num">500+</div>
        <div className="stat-label">Active workspaces</div>
      </div>
      <div className="stat">
        <div className="stat-num">99.9%</div>
        <div className="stat-label">Uptime SLA</div>
      </div>
      <div className="stat">
        <div className="stat-num">2.1s</div>
        <div className="stat-label">Avg. response time</div>
      </div>
    </div>
  );
}
