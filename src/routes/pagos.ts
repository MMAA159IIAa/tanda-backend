import { Router } from 'express';
import { prisma } from '../services/prisma';
import { createPaymentIntent, calculateSplit, transferPayout } from '../services/stripe';
import { premiarUsuario } from '../services/reputacion';
import { createMercadoPagoPayment } from '../services/mercadopago';

const router = Router();

// Híbrido: Stripe (Inmediato) | Mercado Pago OXXO/SPEI (Asincrono)
router.post('/real-charge', async (req, res) => {
  try {
    const { usuario_id, tanda_id, numero_semana, monto, metodo_pago } = req.body;
    // metodo_pago = "stripe", "oxxo", "spei"

    const user = await prisma.usuario.findUnique({ where: { id: usuario_id }});
    if (!user) return res.status(404).json({ error: 'User not found' });

    const paymentMonto = Number(monto);
    const descripcion = `Aportación Semana ${numero_semana} en Tanda Confiable`;

    // ------------------------------------------
    // CASO 1: TARJETA (STRIPE) -> Confirmación Inmediata
    // ------------------------------------------
    if (metodo_pago === 'stripe') {
        let charge;
        try {
            charge = await createPaymentIntent(paymentMonto, descripcion);
        } catch (stripeError: any) {
            return res.status(400).json({ error: 'Pago declinado por el banco.', details: stripeError.message });
        }

        const split = calculateSplit(paymentMonto);

        const pago = await prisma.pago.create({
            data: {
                usuario_id,
                tanda_id,
                numero_semana,
                monto: paymentMonto,
                comision_plataforma: split.plataformaComision,
                fondo_seguridad: split.fondoProteccion,
                aportacion_tanda: split.tandaRecibe,
                estado: 'pagado',
                metodo_pago: 'stripe',
                referencia_externa: charge.id
            }
        });

        await prisma.tanda.update({ where: { id: tanda_id }, data: { saldo_fondo: { increment: split.fondoProteccion } } });
        await premiarUsuario(usuario_id, 'pago');

        return res.status(201).json({ message: 'Cobro inmediato validado con Stripe.', pago });
    }

    // ------------------------------------------
    // CASO 2 y 3: OXXO o SPEI (MERCADO PAGO) -> Asíncrono
    // ------------------------------------------
    if (metodo_pago === 'oxxo' || metodo_pago === 'spei') {
        const mpIntent = await createMercadoPagoPayment(paymentMonto, metodo_pago as 'oxxo'|'spei', user.email, descripcion);

        // ATENCIÓN: Se crea con estado pendiente, la comisión y el pozo están en $0 hasta que confirme el webhook
        const pago = await prisma.pago.create({
            data: {
                usuario_id,
                tanda_id,
                numero_semana,
                monto: paymentMonto,
                comision_plataforma: 0,
                fondo_seguridad: 0,
                aportacion_tanda: 0,
                estado: 'pendiente_confirmacion',
                metodo_pago: metodo_pago,
                referencia_externa: mpIntent.id,
                url_pago: mpIntent.transaction_details?.external_resource_url || mpIntent.transaction_details?.bank_transfer_id
            }
        });

        // Backend returns the pending state and the voucher URL to the Frontend UI
        return res.status(201).json({ 
            message: 'Intención de pago generada. Esperando pago físico.', 
            pago 
        });
    }

    return res.status(400).json({ error: 'Método de pago no soportado' });

  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Payout Route
router.post('/payout', async (req, res) => {
    try {
        const { usuario_id, tanda_id, monto_total } = req.body;
        const stripeAccountId = 'acct_mock456'; 
        const transfer = await transferPayout(stripeAccountId, Number(monto_total));
        res.status(200).json({ message: 'Dinero transferido a la cuenta bancaria del usuario exitosamente', transfer });
    } catch (e: any) {
        res.status(500).json({ error: 'Fallo al procesar el Payout al usuario ganador', details: e.message });
    }
});

export default router;
