import React from 'react';
import Link from 'next/link';
import { Button } from '../ui/Button';

export function Navbar() {
  return (
    <nav className="navbar">
      <Link href="/" className="nav-logo">
        Plugin<span>AI</span>
      </Link>
      <ul className="nav-links">
        <li><Link href="#features">Features</Link></li>
        <li><Link href="#how-it-works">How it works</Link></li>
        <li><Link href="#pricing">Pricing</Link></li>
        <li><Link href="#docs">Docs</Link></li>
      </ul>
      <div style={{ display: 'flex', gap: '12px' }}>
        <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
        <Link href="/register"><Button variant="primary">Get started free</Button></Link>
      </div>
    </nav>
  );
}
