import api from './api';

export interface SubscriptionPackage {
  subscription_id: number;
  subscription_code: string;
  package_name: string;
  price: number;
  document_upload_limit: number;
  query_limit: number;
  workspaces: number;
  support: string;
  api_requests_limit: number;
  max_tokens: number;
  analytics: string;
  api_keys_limit: number;
  renewal_period: string;
  description: string;
}

export interface UserSubscription {
  subscription_id: string;
  subscription_package_code: string;
  start_date: string;
  end_date: string;
  status: string;
  payment_status: string;
  renewal_date: string;
  user_id: string;
  payment_transaction_id: string;
}

/** POST /subscription/get_all_plans */
export async function fetchAllPlans(): Promise<SubscriptionPackage[]> {
  const res = await api.post('/subscription/get_all_plans');
  return res.data?.data ?? [];
}

/** POST /subscription/activate  —  params: user_id, subscription_plan_code */
export async function activatePlan(userId: string, planCode: string) {
  const res = await api.post('/subscription/activate', null, {
    params: { user_id: userId, subscription_plan_code: planCode },
  });
  return res.data as { message: string; subscription: UserSubscription; payment: any };
}

/** POST /subscription/cancel  —  params: subscription_id */
export async function cancelSubscription(subscriptionId: string) {
  const res = await api.post('/subscription/cancel', null, {
    params: { subscription_id: subscriptionId },
  });
  return res.data as { message: string };
}

/** POST /subscription/renew  —  params: user_id */
export async function renewSubscription(userId: string) {
  const res = await api.post('/subscription/renew', null, {
    params: { user_id: userId },
  });
  return res.data as { message: string; subscription: UserSubscription };
}

/** POST /subscription/get_subscription_details  —  params: user_id */
export async function fetchSubscriptionDetails(userId: string): Promise<UserSubscription | null> {
  try {
    const res = await api.post('/subscription/get_subscription_details', null, {
      params: { user_id: userId },
    });
    return res.data?.subscription ?? null;
  } catch {
    return null; // 404 means no subscription
  }
}

/** GET /subscription/subscriptions_status  —  params: user_id */
export async function checkSubscriptionStatus(userId: string): Promise<string | null> {
  try {
    const res = await api.get('/subscription/subscriptions_status', {
      params: { user_id: userId },
    });
    return res.data?.subscription ?? null;
  } catch {
    return null;
  }
}
