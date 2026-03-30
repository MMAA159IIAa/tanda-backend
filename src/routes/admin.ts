import { Router } from 'express';
import { prisma } from '../services/prisma';

const router = Router();

// Endpoint de EMERGENCIA para limpiar datos antes del lanzamiento
router.get('/clear-data-emergency', async (req, res) => {
  try {
    console.log('🧹 Iniciando limpieza de datos de emergencia...');
    await prisma.pago.deleteMany({});
    await prisma.participante.deleteMany({});
    await prisma.tanda.deleteMany({});
    await prisma.usuario.deleteMany({
      where: { NOT: { telefono: '6625827754' } }
    });
    res.json({ message: '✨ Sistema Limpio. Solo queda la cuenta Maestra.' });
  } catch (error) {
    res.status(500).json({ error: 'Error en limpieza' });
  }
});

// ─── MOTOR: 5 Tandas Estándar del Sistema ───────────────────────────────────
const TANDAS_SISTEMA = [
  { nombre: 'Tanda Segura 1', monto: 200, tipo: 'basica' },
  { nombre: 'Tanda Segura 2', monto: 400, tipo: 'media' },
  { nombre: 'Tanda Segura 3', monto: 500, tipo: 'pro' },
  { nombre: 'Tanda Segura 4', monto: 800, tipo: 'pro' },
  { nombre: 'Tanda Segura 5', monto: 1000, tipo: 'premium' },
];

// Función reutilizable: asegura que siempre haya una tanda en 'esperando' por tipo
export const asegurarTandasSistema = async () => {
  // Usamos el admin como creador de las tandas del sistema (necesario por FK)
  const admin = await prisma.usuario.findUnique({ where: { telefono: '6625827754' } });
  if (!admin) {
    console.log('⚠️ Admin no encontrado, no se crean tandas del sistema todavía.');
    return;
  }

  for (const [idx, t] of TANDAS_SISTEMA.entries()) {
    const existe = await prisma.tanda.findFirst({
      where: { monto_semanal: t.monto, tipo: 'sistema', estado: 'esperando' }
    });
    if (!existe) {
      await prisma.tanda.create({
        data: {
          nombre: t.nombre,
          tipo: 'sistema',
          monto_semanal: t.monto,
          duracion_semanas: 10,
          creador_id: admin.id,
          codigo_invitacion: `SIS-${t.tipo.toUpperCase()}-${Date.now()}-${idx}`,
          estado: 'esperando'
        }
      });
      console.log(`✅ ${t.nombre} creada automáticamente`);
    }
  }
};

// Endpoint GET para inicializar (llamar desde el navegador si es necesario)
router.get('/init-system-tandas', async (req, res) => {
  try {
    await asegurarTandasSistema();
    res.json({ message: '✨ 5 Tandas del Sistema están listas para el lanzamiento.' });
  } catch (error) {
    res.status(500).json({ error: 'Error inicializando tandas' });
  }
});

router.get('/dashboard', async (req, res) => {
    try {
        // 9. MOTOR DE INGRESOS (DASHBOARD ADMIN)
        
        // Sum of all 5% platform commissions
        const aggregate = await prisma.pago.aggregate({
            _sum: { comision_plataforma: true }
        }); 
        const totalGanancias = Number(aggregate._sum.comision_plataforma || 0);

        // Current active tandas
        const tandasActivas = await prisma.tanda.count({
            where: { estado: 'activa' }
        });

        // Active users
        const usuariosActivos = await prisma.usuario.count();

        // 10. ALERTAS CRITICAS
        // Detect tandas with > 2 usuarios atrasados
        const tandas = await prisma.tanda.findMany({
            where: { estado: 'activa' },
            include: { participantes: true }
        });

        const alertasCriticas: any[] = [];
        for (const t of (tandas as any[])) {
            const atrasados = (t.participantes as any[]).filter((p: any) => p.estado === 'atrasado');
            if (atrasados.length > 2) {
                alertasCriticas.push({
                    tanda_id: t.id,
                    nombre: t.nombre,
                    mensaje: `¡Alerta! La tanda tiene ${atrasados.length} usuarios atrasados. Riesgo Alto.`
                });
            }
            if (Number(t.saldo_fondo) < (Number(t.monto_semanal) * 0.5)) {
                 alertasCriticas.push({
                    tanda_id: t.id,
                    nombre: t.nombre,
                    mensaje: `Fondo de Protección críticamente bajo.`
                });
            }
        }

        res.json({
            ganancias_totales: totalGanancias,
            tandas_activas: tandasActivas,
            usuarios_activos: usuariosActivos,
            alertas_criticas: alertasCriticas
        });

    } catch (e) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

export default router;
