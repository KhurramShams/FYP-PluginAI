'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
  fetchAllPlans, activatePlan, fetchSubscriptionDetails,
  SubscriptionPackage, UserSubscription,
} from '@/lib/subscriptionService';
import { extractErrorMessage } from '@/lib/authService';
import { getPaymentMethods, PaymentMethod } from '@/lib/paymentService';
import { CreditCard, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';

// ── Shared Styling Utilities ──────────────────────────────────────────────────
const THEME = {
  primary: '#7c6df0',
  primaryHover: '#6a5ccd',
  bgCard: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  textMuted: 'rgba(255,255,255,0.45)',
  success: '#22c55e',
};

function Feature({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: highlight ? '#a89ff5' : '#fff' }}>{value}</span>
    </div>
  );
}

// ── Payment Simulation Modal ──────────────────────────────────────────────────
function PaymentSimulationModal({
  plan, methods, onClose, onConfirm,
}: {
  plan: SubscriptionPackage;
  methods: PaymentMethod[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [step, setStep] = useState<'checkout' | 'processing' | 'success'>('checkout');
  const [error, setError] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState(methods.length > 0 ? methods[0].payment_details_id : '');

  const handleProceed = async () => {
    setError('');
    // Switch to simulated processing state
    setStep('processing');
    
    // Simulate realistic 3-second network/gateway delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Execute the REAL backend activation vector under the hood
      await onConfirm();
      setStep('success');
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Payment authorization failed.'));
      setStep('checkout');
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#13131a', border: `1px solid ${THEME.border}`, borderRadius: '24px',
        width: '100%', maxWidth: '850px', display: 'flex', overflow: 'hidden',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        animation: 'modalSlideUp 0.3s ease-out forwards'
      }}>
        
        {/* Left Side: Order Summary */}
        <div style={{ flex: 1, padding: '40px', background: 'rgba(255,255,255,0.02)', borderRight: `1px solid ${THEME.border}` }}>
          <div style={{ fontSize: '13px', color: THEME.primary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Order Summary</div>
          <h2 style={{ fontSize: '28px', color: '#fff', fontWeight: 700, marginBottom: '6px' }}>{plan.package_name}</h2>
          <p style={{ fontSize: '14px', color: THEME.textMuted, marginBottom: '32px' }}>{plan.description}</p>
          
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '40px' }}>
            <span style={{ fontSize: '48px', color: '#fff', fontWeight: 800, lineHeight: 1 }}>${plan.price}</span>
            <span style={{ fontSize: '15px', color: THEME.textMuted, paddingBottom: '8px' }}>/ month</span>
          </div>

          <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: '24px' }}>
            <div style={{ fontSize: '14px', color: '#fff', fontWeight: 600, marginBottom: '16px' }}>Plan includes:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>
                 <CheckCircle2 size={16} color={THEME.primary} /> Up to {plan.workspaces} active Workspaces
               </div>
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>
                 <CheckCircle2 size={16} color={THEME.primary} /> {plan.max_tokens.toLocaleString()} LLM Tokens per month
               </div>
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>
                 <CheckCircle2 size={16} color={THEME.primary} /> Full {plan.analytics} integration
               </div>
            </div>
          </div>
        </div>

        {/* Right Side: Payment Simulation */}
        <div style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          
          {step === 'checkout' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
               <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '32px' }}>
                 <div style={{ background: 'rgba(124,109,240,0.1)', padding: '10px', borderRadius: '12px' }}>
                   <CreditCard size={24} color={THEME.primary} />
                 </div>
                 <div>
                   <h3 style={{ fontSize: '18px', color: '#fff', fontWeight: 600 }}>Payment Method</h3>
                   <span style={{ fontSize: '13px', color: THEME.textMuted }}>Secure encrypted checkout</span>
                 </div>
               </div>

               {error && (
                 <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', borderRadius: '8px', fontSize: '13px', marginBottom: '24px' }}>
                   {error}
                 </div>
               )}
               
               <label style={{ display: 'block', fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>Select Billed Matrix</label>
               <select value={selectedMethodId} onChange={e => setSelectedMethodId(e.target.value)} style={{ width: '100%', padding: '16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${THEME.border}`, borderRadius: '12px', color: '#fff', fontSize: '14px', outline: 'none', marginBottom: '16px', appearance: 'none', cursor: 'pointer' }}>
                  {methods.map(m => (
                    <option key={m.payment_details_id} value={m.payment_details_id} style={{ background: '#13131a' }}>
                      {m.payment_method_type === 'Card' ? `${m.card_brand} Card` : `${m.bank_name} Bank`} (Holder: {m.account_holder_name}) - {m.currency_code}
                    </option>
                  ))}
               </select>

               <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                 <button onClick={onClose} style={{ flex: 1, padding: '14px', background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>Cancel</button>
                 <button onClick={handleProceed} style={{ flex: 2, padding: '14px', background: THEME.primary, border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 8px 24px rgba(124,109,240,0.3)', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = THEME.primaryHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = THEME.primary}
                 >
                   <ShieldCheck size={18} /> Proceed
                 </button>
               </div>
            </div>
          )}

          {step === 'processing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s ease-out', minHeight: '300px' }}>
               <style>{`
                 @keyframes pulseRing {
                   0% { transform: scale(0.8); opacity: 0.5; box-shadow: 0 0 0 0 rgba(124,109,240, 0.7); }
                   70% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 20px rgba(124,109,240, 0); }
                   100% { transform: scale(0.8); opacity: 0.5; box-shadow: 0 0 0 0 rgba(124,109,240, 0); }
                 }
                 @keyframes spin { 100% { transform: rotate(360deg); } }
               `}</style>
               <div style={{
                 width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(124,109,240,0.1)',
                 display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
                 animation: 'pulseRing 2s infinite'
               }}>
                 <Loader2 size={32} color={THEME.primary} style={{ animation: 'spin 1.5s linear infinite' }} />
               </div>
               <h3 style={{ fontSize: '20px', color: '#fff', fontWeight: 600, marginBottom: '8px' }}>Processing Payment...</h3>
               <p style={{ fontSize: '14px', color: THEME.textMuted }}>Please do not close or refresh this window.</p>
            </div>
          )}

          {step === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s ease-out', minHeight: '300px' }}>
               <div style={{
                 width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)',
                 display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px'
               }}>
                 <CheckCircle2 size={40} color={THEME.success} />
               </div>
               <h3 style={{ fontSize: '24px', color: '#fff', fontWeight: 600, marginBottom: '8px' }}>Payment Successful</h3>
               <p style={{ fontSize: '14px', color: THEME.textMuted, textAlign: 'center', maxWidth: '300px' }}>Your subscription has been securely activated. Redirecting you to the dashboard...</p>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────
function PlanCard({
  plan, isPopular, isCurrentPlan, onSelect,
}: {
  plan: SubscriptionPackage; isPopular: boolean; isCurrentPlan: boolean;
  onSelect: (plan: SubscriptionPackage) => void;
}) {
  return (
    <div style={{
      background: THEME.bgCard,
      border: isPopular ? `1px solid rgba(124,109,240,0.4)` : `0.5px solid ${THEME.border}`,
      borderRadius: '20px', padding: '32px', display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden', transition: 'border-color 0.25s, transform 0.25s',
      transform: isPopular ? 'scale(1.03)' : 'none',
    }}
      onMouseEnter={e => { if (!isPopular) e.currentTarget.style.borderColor = 'rgba(124,109,240,0.25)'; }}
      onMouseLeave={e => { if (!isPopular) e.currentTarget.style.borderColor = THEME.border; }}
    >
      {isPopular && (
        <div style={{
          position: 'absolute', top: '16px', right: '16px', padding: '4px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
          background: 'linear-gradient(135deg, #7c6df0, #a89ff5)', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px',
        }}>Most Popular</div>
      )}
      {isCurrentPlan && (
        <div style={{
          position: 'absolute', top: '16px', right: '16px', padding: '4px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
          background: 'rgba(34,197,94,0.15)', color: THEME.success, border: '0.5px solid rgba(34,197,94,0.3)',
        }}>Current Plan</div>
      )}

      <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>{plan.package_name}</h3>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginBottom: '24px', lineHeight: 1.5 }}>{plan.description}</p>

      <div style={{ marginBottom: '28px' }}>
        <span style={{ fontSize: '42px', fontWeight: 800, color: '#fff' }}>${plan.price}</span>
        <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>/{plan.renewal_period.toLowerCase()}</span>
      </div>

      <div style={{ flex: 1, marginBottom: '28px' }}>
        <Feature label="Workspaces" value={plan.workspaces} highlight />
        <Feature label="Document Uploads / WS" value={plan.document_upload_limit} />
        <Feature label="Queries / WS" value={plan.query_limit.toLocaleString()} />
        <Feature label="API Keys / WS" value={plan.api_keys_limit} />
        <Feature label="Max Tokens / WS" value={plan.max_tokens.toLocaleString()} />
        <Feature label="API Requests" value={plan.api_requests_limit.toLocaleString()} />
        <Feature label="Analytics" value={plan.analytics} />
        <Feature label="Support" value={plan.support} />
      </div>

      <button
        onClick={() => onSelect(plan)}
        disabled={isCurrentPlan}
        style={{
          width: '100%', padding: '14px',
          background: isCurrentPlan ? 'rgba(34,197,94,0.15)' : (isPopular ? THEME.primary : 'rgba(255,255,255,0.06)'),
          border: isCurrentPlan ? '0.5px solid rgba(34,197,94,0.3)' : (isPopular ? 'none' : `0.5px solid rgba(255,255,255,0.12)`),
          borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: isCurrentPlan ? 'default' : 'pointer',
          color: isCurrentPlan ? THEME.success : '#fff', transition: 'all 0.2s',
        }}
      >
        {isCurrentPlan ? '✓ Active Plan' : 'Select Plan'}
      </button>
    </div>
  );
}

// ── Main Page Implementation ──────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [plans, setPlans]           = useState<SubscriptionPackage[]>([]);
  const [currentSub, setCurrentSub] = useState<UserSubscription | null>(null);
  const [methods, setMethods]       = useState<PaymentMethod[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  
  // Modal tracking
  const [activeModalPlan, setActiveModalPlan] = useState<SubscriptionPackage | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [allPlans, sub, meth] = await Promise.all([
        fetchAllPlans(),
        user?.user_id ? fetchSubscriptionDetails(user.user_id) : Promise.resolve(null),
        user?.user_id ? getPaymentMethods(user.user_id) : Promise.resolve([])
      ]);
      setPlans(allPlans.sort((a, b) => a.price - b.price));
      setCurrentSub(sub);
      setMethods(meth);
    } catch (e: any) {
      setError(extractErrorMessage(e, 'Failed to load subscription planes.'));
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Execute the physical API verification process linked inside the Modal verification step.
  const executeSubscriptionAPI = async () => {
    if (!user?.user_id || !activeModalPlan) throw new Error("Missing authentication context.");
    await activatePlan(user.user_id, activeModalPlan.subscription_code);
    await load();
    setTimeout(() => {
       setActiveModalPlan(null);
       router.push('/app/dashboard');
    }, 2500);
  };

  return (
    <div>
      <style>{`
         @keyframes modalSlideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
         @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      
      {/* Dynamic Checkout Lock */}
      {activeModalPlan && (
         <PaymentSimulationModal 
            plan={activeModalPlan} 
            methods={methods}
            onClose={() => setActiveModalPlan(null)} 
            onConfirm={executeSubscriptionAPI} 
         />
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
          Choose Your Scale
        </h1>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.45)', maxWidth: '520px', margin: '0 auto', lineHeight: 1.6 }}>
          Connect securely via Stripe API logic to mount higher infrastructure ceilings against your active namespace.
        </p>
      </div>

      {error && (
        <div style={{ maxWidth: '600px', margin: '0 auto 24px', padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '10px', fontSize: '13px', color: '#f87171', textAlign: 'center' }}>
          ⚠ {error}
        </div>
      )}

      {/* Pricing Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: THEME.bgCard, border: `0.5px solid ${THEME.border}`, borderRadius: '20px', padding: '32px', minHeight: '480px' }}>
              {[['50%','22px'],['70%','14px'],['30%','44px'],['100%','10px'],['100%','10px'],['100%','10px'],['100%','10px']].map(([w,h],j)=>(
                <div key={j} style={{ width: w, height: h, background: 'rgba(255,255,255,0.06)', borderRadius: '6px', marginBottom: '16px' }} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'start' }}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.subscription_code}
              plan={plan}
              isPopular={plan.subscription_code === 'PP-01'}
              isCurrentPlan={currentSub?.subscription_package_code === plan.subscription_code}
              onSelect={(p) => {
                 if (!user?.user_id) router.push('/login');
                 else if (methods.length === 0) {
                     alert("Action Blocked: No active payment methods detected. Please navigate to Settings > Billing to map a target Gateway method before subscribing!");
                 } else {
                     setActiveModalPlan(p);
                 }
              }}
            />
          ))}
        </div>
      )}

    </div>
  );
}
