import React from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ position: 'absolute', top: '24px', left: '32px' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
          <img
            src="/PluginAi-Logo.png"
            alt="Plugin AI"
            style={{ height: '36px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </Link>
      </div>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {children}
      </div>
    </div>
  );
}
