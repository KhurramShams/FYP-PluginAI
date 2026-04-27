'use client';
import React from 'react';
import { Card } from '@/components/ui/Card';

export default function AdminSettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '28px', margin: '0 0 8px 0' }}>System Configuration</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Manage backend environmental configs, security policies, and package rules.</p>
      </div>
      <Card style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚙️</div>
        <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Security & Platform Limits</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '400px', margin: '0 auto' }}>
          Provides an interface over DimSubscriptionPackages, global rate limiter throttling, and master 2FA toggles.
        </p>
      </Card>
    </div>
  );
}
