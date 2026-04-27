import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Hero } from '@/components/landing/Hero';
import { Stats } from '@/components/landing/Stats';
import { Features } from '@/components/landing/Features';
import { DemoChat } from '@/components/landing/DemoChat';
import { Pricing } from '@/components/landing/Pricing';
import { PublicRouteGuard } from '@/components/auth/PublicRouteGuard';

export default function Home() {
  return (
    <>
      <PublicRouteGuard />
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Features />
        <DemoChat />
        <Pricing />
      </main>
      <footer>
        <div className="footer-logo">Plugin<span>AI</span></div>
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Docs</a>
          <a href="#">Support</a>
          <a href="#">Status</a>
        </div>
        <div className="footer-copy">© 2026 Plugin AI. All rights reserved.</div>
      </footer>
    </>
  );
}
