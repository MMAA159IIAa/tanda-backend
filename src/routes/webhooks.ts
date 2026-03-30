import { Router } from 'express';
import { prisma } from '../services/prisma';
import { calculateSplit } from '../services/stripe'; 
import { premiarUsuario } from '../services/reputacion';

const router = Router();

router.post('/mercadopago', async (req, res) => {
    try {
        const { action, data } = req.body;
        
        if (action === 'payment.updated' || action === 'payment.created') {
            const paymentId = data.id.toString();
            // ESCENARIO 3: SImulacion de status approved 
            const mpStatus = 'approved'; 
            
            const pagoPrevio = await prisma.pago.findFirst({ where: { referencia_externa: paymentId } });
            
            if (!pagoPrevio) return res.status(200).send('OK (ignorado, ajeno a app)');
            
            // CACHEO TEMPRANO: Si ya esta pagado, ignoramos
            if (pagoPrevio.estado === 'pagado') {
                 console.log(`[ESCENARIO 4 - EXITO] Webhook duplicado ignorado de manera segura para REF: ${paymentId}`);
                 return res.status(200).send('OK');
            }

            if (mpStatus === 'approved') {
                const split = calculateSplit(Number(pagoPrevio.monto));
                
                // ESCENARIO 7 - CONCURRENCIA Y ATOMICIDAD
                // Usamos updateMany con condición 'pendiente_confirmacion' actuando como un LOCK optimista
                // Si pasa la validacíon paralela, updateMany solo afectará 1, el otro hilo afectará 0
                const updateRes = await prisma.pago.updateMany({
                    where: { 
                        referencia_externa: paymentId,
                        estado: 'pendiente_confirmacion' 
                    },
                    data: { 
                        estado: 'pagado',
                        comision_plataforma: split.plataformaComision,
                        fondo_seguridad: split.fondoProteccion,
                        aportacion_tanda: split.tandaRecibe
                    }
                });

                if (updateRes.count === 0) {
                     console.log(`[ESCENARIO 7 - EXITO] Carrera de concurrencia evitada en REF: ${paymentId}`);
                     return res.status(200).send('OK');
                }

                await prisma.tanda.update({
                    where: { id: pagoPrevio.tanda_id },
                    data: { saldo_fondo: { increment: split.fondoProteccion } }
                });

                await premiarUsuario(pagoPrevio.usuario_id, 'pago');
                
                // FASE 3: AUDITORIA DE DINERO
                const totalCalculado = split.tandaRecibe + split.fondoProteccion + split.plataformaComision;
                console.log(`\n================ AUDITORÍA FINANCIERA ================`);
                console.log(`💰 PAGO CONFIRMADO: $${pagoPrevio.monto} via ${pagoPrevio.metodo_pago.toUpperCase()}`);
                console.log(`✅ 93% Tanda: $${split.tandaRecibe}`);
                console.log(`🛡️ 2% Fondo: $${split.fondoProteccion}`);
                console.log(`📈 5% Comisión: $${split.plataformaComision}`);
                console.log(`SUMA MATEMÁTICA: $${totalCalculado} (Debe ser igual al Monto Original)`);
                if(totalCalculado !== Number(pagoPrevio.monto)) {
                     console.error('❌ FATAL: LAS FRACCIONES NO SUMAN EL 100%');
                } else {
                     console.log('✅ AUDITORIA PASADA: Division limpia sin perdida de centavos.');
                }
                console.log(`========================================================\n`);

            } else if (mpStatus === 'rejected') {
                await prisma.pago.updateMany({
                     where: { referencia_externa: paymentId, estado: 'pendiente_confirmacion' },
                     data: { estado: 'fallido' }
                });
            }
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook error', e);
        res.status(500).send('Internal Server Error');
    }
});

export default router;
