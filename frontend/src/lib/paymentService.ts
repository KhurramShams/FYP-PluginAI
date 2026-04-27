import api from './api';

export interface PaymentMethod {
  payment_details_id: string;
  user_id: string;
  payment_method_type: string; // "Card" or "Bank"
  bank_name?: string;
  account_holder_name: string;
  card_brand?: string;
  currency_code: string;
  expiration_date?: string;
  Is_default_method: boolean;
  created_at: string;
}

export interface PaymentMethodCreatePayload {
  user_id: string;
  payment_method_type: string;
  bank_name?: string;
  account_holder_name: string;
  card_brand?: string;
  currency_code: string;
  expiration_date?: string;
  Is_default_method: boolean;
}

export interface PaymentTransaction {
  id: string;
  transaction_time: string;
  transaction_date: string;
  user_id: string;
  payment_reference_number: string;
  amount: number;
  currency: string;
  status: string;
  subscription_package_code: string;
  payment_details_id: string;
}

export async function getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  const res = await api.get('/payment-method/get_method', { params: { user_id: userId } });
  return res.data.payment_methods || [];
}

export async function addPaymentMethod(payload: PaymentMethodCreatePayload): Promise<void> {
  await api.post('/payment-method/add-methods', payload);
}

export async function deletePaymentMethod(paymentDetailsId: string): Promise<void> {
  await api.delete('/payment-method/delete-method', { params: { payment_details_id: paymentDetailsId } });
}

export async function getPaymentHistory(userId: string): Promise<PaymentTransaction[]> {
  const res = await api.get('/payment-method/payment-history', { params: { user_id: userId } });
  return res.data.transactions || [];
}
