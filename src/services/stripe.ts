// Stripe SDK Wrapper for Tanda Confiable
import Stripe from 'stripe';

// Initialize Stripe (requires STRIPE_SECRET_KEY in production)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_123', {
  apiVersion: '2025-02-24.acacia' as any, 
});

/**
 * Creates a Stripe Customer for tokenizing their cards.
 */
export const createCustomer = async (email: string, name: string) => {
  const customer = await stripe.customers.create({
    email,
    name,
  });
  return customer;
};

/**
 * Creates a PaymentIntent for the frontend Stripe SDK to confirm.
 */
export const createPaymentIntent = async (amountMx: number, description: string) => {
  // Amount in centavos for Mexican Pesos ($100 MXN = 10000)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountMx * 100,
    currency: 'mxn',
    description,
    payment_method_types: ['card'],
  });
  return paymentIntent;
};

/**
 * Retrieves a PaymentIntent to verify its status.
 */
export const verifyPaymentIntent = async (paymentIntentId: string) => {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
};

/**
 * Transfers the final payout (Pozo) to the user via Stripe Connect
 */
export const transferPayout = async (stripeConnectedAccountId: string, amountMx: number) => {
  const transfer = await stripe.transfers.create({
    amount: amountMx * 100,
    currency: 'mxn',
    destination: stripeConnectedAccountId,
  });
  return transfer;
};

/**
 * Split rules engine. Enforces 93/5/2 cut mathematically.
 */
export const calculateSplit = (monto: number) => {
  return {
    tandaRecibe: parseFloat((monto * 0.93).toFixed(2)),
    plataformaComision: parseFloat((monto * 0.05).toFixed(2)),
    fondoProteccion: parseFloat((monto * 0.02).toFixed(2))
  };
};
