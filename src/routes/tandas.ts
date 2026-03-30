import { Router } from 'express';
import { prisma } from '../services/prisma';
import crypto from 'crypto';
import { asignarTurnos } from '../services/turnos';

const router = Router();

// Create Tanda
router.post('/', async (req, res) => {
  try {
    const { nombre, tipo, monto_semanal, duracion_semanas, creador_id } = req.body;
    
    const codigo_invitacion = crypto.randomBytes(4).toString('hex').toUpperCase();

    const nuevaTanda = await prisma.tanda.create({
      data: {
        nombre,
        tipo,
        monto_semanal: Number(monto_semanal),
        duracion_semanas: Number(duracion_semanas),
        creador_id,
        codigo_invitacion,
        participantes: {
          create: {
            usuario_id: creador_id,
            deposito_inicial: true // El creador paga al crear para dar confianza
          }
        }
      }
    });

    res.status(201).json(nuevaTanda);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Join Tanda
router.post('/join', async (req, res) => {
  try {
    const { codigo_invitacion, usuario_id } = req.body;

    const tanda = await prisma.tanda.findUnique({ where: { codigo_invitacion } });
    if (!tanda) return res.status(404).json({ error: 'Tanda not found' });

    if (tanda.estado !== 'esperando') {
      return res.status(400).json({ error: 'Tanda is already active or finished' });
    }

    const count = await prisma.participante.count({ where: { tanda_id: tanda.id } });
    
    if (count >= tanda.total_integrantes) {
      return res.status(400).json({ error: 'Tanda is full' });
    }

    // MVP: assume immediate deposit=true for testing logic
    // 1. Verificar si es Administrador (por su teléfono) para darle "PAGADO" por defecto en tandas de sistema
    const usuarioInfo = await prisma.usuario.findUnique({ where: { id: usuario_id } });
    const esAdmin = usuarioInfo?.telefono === '6625827754';

    const participante = await prisma.participante.create({
      data: {
        tanda_id: tanda.id,
        usuario_id: usuario_id,
        deposito_inicial: esAdmin // Si es admin, sale como PAGADO por prestigio
      }
    });

    // 2. Si el participante quedó marcado como pagado (admin), registrar el pago simulado
    if (esAdmin) {
       await prisma.participante.update({ where: { id: participante.id }, data: { estado: 'pagado' } });
       await prisma.pago.create({
          data: {
              tanda_id: tanda.id,
              usuario_id: usuario_id,
              numero_semana: 1,
              monto: tanda.monto_semanal,
              comision_plataforma: 0,
              fondo_seguridad: 0,
              aportacion_tanda: tanda.monto_semanal,
              estado: 'pagado',
              metodo_pago: 'cortesia_admin'
          }
       });
    }

    const newCount = count + 1;
    
    // Auto-activate if it reached full capacity
    if (newCount === tanda.total_integrantes) {
      await prisma.tanda.update({
        where: { id: tanda.id },
        data: { estado: 'activa', fecha_inicio: new Date() }
      });
      await asignarTurnos(tanda.id);

      // AUTO-RÉPLICA: Si es tanda del sistema, crear una nueva del mismo tipo
      if (tanda.tipo === 'sistema') {
        const num = Math.floor(Date.now() % 1000);
        await prisma.tanda.create({
          data: {
            nombre: tanda.nombre.replace(/\d+$/, '') + (num),
            tipo: 'sistema',
            monto_semanal: tanda.monto_semanal,
            duracion_semanas: tanda.duracion_semanas,
            creador_id: 'SISTEMA-AI',
            codigo_invitacion: `SIS-REP-${Date.now()}-${num}`,
            estado: 'esperando'
          }
        });
        console.log(`♻️ Tanda "${tanda.nombre}" llena → nueva creada automáticamente`);
      }
    }

    res.status(200).json({ message: 'Joined successfully', participante, activated: newCount === tanda.total_integrantes });
  } catch (error: any) {
    if (error.code === 'P2002') {
         return res.status(400).json({ error: 'Ya estás en esta Tanda' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Buscar tanda por código de invitación (para vista previa antes de unirse)
router.get('/by-code/:codigo', async (req, res) => {
  try {
    const tanda = await prisma.tanda.findUnique({
      where: { codigo_invitacion: req.params.codigo.toUpperCase() },
      include: {
        participantes: { include: { usuario: true } }
      }
    });
    if (!tanda) return res.status(404).json({ error: 'Código de invitación no encontrado' });
    res.json(tanda);
  } catch (e) {
    res.status(500).json({ error: 'Error buscando tanda' });
  }
});

// Get Tanda Details
router.get('/:id', async (req, res) => {
    try {
        const tanda = await prisma.tanda.findUnique({
            where: { id: req.params.id },
            include: {
                participantes: {
                    include: { usuario: true },
                    orderBy: { posicion_turno: 'asc' }
                }
            }
        });
        if (!tanda) return res.status(404).json({ error: 'Not found' });
        res.json(tanda);
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

import { createPaymentIntent, verifyPaymentIntent } from '../services/stripe';
import { createMercadoPagoPayment } from '../services/mercadopago';

// 1. Create Payment Intent (Get Secret or Ticket)
router.post('/:id/create-intent', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario_id, monto, method } = req.body;

        const pRecord = await prisma.participante.findFirst({
            where: { tanda_id: id, usuario_id: usuario_id }
        });
        if (!pRecord) return res.status(404).json({ error: 'Participante no encontrado' });

        if (method === 'stripe') {
            const intent = await createPaymentIntent(Number(monto), `Aportación Tanda ${id}`);
            return res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
        } else if (method === 'oxxo' || method === 'spei') {
            const user = await prisma.usuario.findUnique({ where: { id: usuario_id } });
            const mpPayment = await createMercadoPagoPayment(Number(monto), method, user?.email || 'user@test.com', `Aportación ${id}`);
            return res.json({ 
                ticketUrl: mpPayment.transaction_details.external_resource_url, 
                clabe: mpPayment.transaction_details.bank_transfer_id,
                paymentId: mpPayment.id 
            });
        }
        res.status(400).json({ error: 'Método desconocido' });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Error creando intent' });
    }
});

// 2. Verify and Confirm Payment DB Update
router.post('/:id/verify-payment', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario_id, monto, method, paymentIntentId } = req.body;

        // Si es Stripe, verificamos con la API que realmente se pagó
        if (method === 'stripe' && paymentIntentId) {
            const intent = await verifyPaymentIntent(paymentIntentId);
            if (intent.status !== 'succeeded') {
                return res.status(400).json({ error: 'El pago no ha sido completado en Stripe' });
            }
        }

        // Si llegó aquí es porque OXXO fue simulado/confirmado, o Stripe verificó 'succeeded'
        const pRecord = await prisma.participante.findFirst({ where: { tanda_id: id, usuario_id: usuario_id } });
        if (!pRecord) return res.status(404).json({ error: 'Participante no encontrado' });

        await prisma.participante.update({ where: { id: pRecord.id }, data: { estado: 'pagado' } });

        const montoNum = Number(monto);
        const comision = montoNum * 0.05;
        const fondo = montoNum * 0.02;
        const aportacion = montoNum - comision - fondo;

        await prisma.tanda.update({ where: { id }, data: { saldo_fondo: { increment: fondo } } });

        await prisma.pago.create({
            data: {
                tanda_id: id,
                usuario_id: usuario_id,
                numero_semana: 1,
                monto: montoNum,
                comision_plataforma: comision,
                fondo_seguridad: fondo,
                aportacion_tanda: aportacion,
                estado: 'pagado',
                metodo_pago: method
            }
        });

        res.json({ success: true });
    } catch (e: any) {
        console.error("ERROR EN VERIFY:", e);
        res.status(500).json({ error: e.message || 'Error verificando pago' });
    }
});

import { calcularNivelYRiesgo } from '../services/reputacion';

// Auto-join Tanda Publica (Smart Matchmaking)
router.post('/auto-join', async (req, res) => {
    try {
        const { usuario_id, monto_semanal } = req.body;
        
        // 6. IA DE RIESGO Y ANTIFRAUDE AL ENTRAR
        const usuarioDesc = await calcularNivelYRiesgo(usuario_id);
        if (!usuarioDesc) return res.status(404).json({error: 'Usuario no encontrado'});

        if (usuarioDesc.nivel === 'bloqueado') {
            return res.status(403).json({error: 'Cuenta restringida: Historial de Pagos Inestable o Reputación < 30.'});
        }

        // 7. MOTOR DE AGRUPACIÓN INTELIGENTE
        // Match users of similar parameters in system tandas
        let tanda = await prisma.tanda.findFirst({
            where: {
                estado: 'esperando',
                tipo: 'sistema',
                monto_semanal: monto_semanal,
            }
        });

        // Si no hay tandas disponibles para su nivel, el sistema crea una nueva.
        if (!tanda) {
            tanda = await prisma.tanda.create({
                data: {
                    nombre: `Fondo Común ${usuarioDesc.nivel.toUpperCase()}`,
                    tipo: 'sistema',
                    monto_semanal: monto_semanal,
                    duracion_semanas: 10,
                    creador_id: 'SISTEMA-AI', 
                    codigo_invitacion: 'AUTO-' + crypto.randomBytes(3).toString('hex').toUpperCase()
                }
            });
        }

        // Deposit confirmation logic (MVP logic implies instant)
        const usuarioInfo = await prisma.usuario.findUnique({ where: { id: usuario_id } });
        const esAdmin = usuarioInfo?.telefono === '6625827754';

        const participante = await prisma.participante.create({
            data: { tanda_id: tanda.id, usuario_id: usuario_id, deposito_inicial: esAdmin }
        });

        if (esAdmin) {
            await prisma.participante.update({ where: { id: participante.id }, data: { estado: 'pagado' } });
        }

        const count = await prisma.participante.count({ where: { tanda_id: tanda.id } });
        if (count >= tanda.total_integrantes) {
            await prisma.tanda.update({ where: { id: tanda.id }, data: { estado: 'activa', fecha_inicio: new Date() } });
            await asignarTurnos(tanda.id);
        }

        res.json({ message: 'Agrupamiento inteligente exitoso', tanda });

    } catch(e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's active tandas
router.get('/user/:userId', async (req, res) => {
    try {
        const participaciones = await prisma.participante.findMany({
            where: { usuario_id: req.params.userId },
            include: {
                tanda: {
                    include: {
                        participantes: {
                             include: { usuario: true }
                        }
                    }
                }
            }
        });
        res.json(participaciones.map((p: any) => p.tanda));
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get available system tandas
router.get('/system/available', async (req, res) => {
    try {
        const tandas = await prisma.tanda.findMany({
            where: {
                tipo: 'sistema',
                estado: 'esperando'
            },
            include: {
                _count: {
                    select: { participantes: true }
                }
            }
        });
        res.json(tandas);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
