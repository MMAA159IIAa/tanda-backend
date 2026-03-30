// Wrapper for Mercado Pago SDK (OXXO & SPEI)
import { MercadoPagoConfig, Payment } from 'mercadopago';

// Initialize MP with Access Token
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || 'TEST-6701038225107940-033006-2ec37843904976a4327ac72a3da0e41b-163914605' });

/**
 * Creates an async Payment Intent in MercadoPago (for OXXO cash or SPEI transfer).
 */
export const createMercadoPagoPayment = async (monto: number, metodo: 'oxxo' | 'spei', email: string, descripcion: string) => {
    // For Production, use the actual SDK
    const payment = new Payment(client);
    const body: any = {
        transaction_amount: monto,
        description: descripcion,
        payment_method_id: metodo,
        payer: { email: email || 'test_user_12345@testuser.com' }
    };
    
    try {
        const response = await payment.create({ body });
        return response;
    } catch (e: any) {
        console.error("MP SDK Create Error:", e);
        throw new Error('Error al generar folio de Mercado Pago: ' + e.message);
    }
};
