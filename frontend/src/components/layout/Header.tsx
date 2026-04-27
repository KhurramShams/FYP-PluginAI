import React from 'react';
import { Button } from '../ui/Button';

export function Header() {
  return (
    <header style={{
      height: '70px',
      borderBottom: '0.5px solid var(--border-subtle)',
      background: 'rgba(10,10,15,0.95)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
          Active Workspace: <strong>Sukkur IBA Docs</strong>
        </div>
        <Button variant="ghost" style={{ padding: '6px 12px', fontSize: '13px' }}>Profile</Button>
      </div>
    </header>
  );
}
