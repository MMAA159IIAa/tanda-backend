import { prisma } from './prisma';
import { penalizarUsuario } from './reputacion';

// Motor Cron (Ejecucion Diaria Simulada)
export const ejecutarCronDiario = async () => {
    console.log('[CRON] Iniciando revision de pagos y protecciones...');
    
    const hoy = new Date();
    
    // Obtener todas las tandas activas
    const tandasActivas = await prisma.tanda.findMany({
        where: { estado: 'activa' },
        include: { participantes: { include: { usuario: true } } }
    });

    for (const tanda of tandasActivas) {
        if (!tanda.fecha_inicio) continue;

        // Calculo de la semana actual de esta tanda
        const diffTime = Math.abs(hoy.getTime() - new Date(tanda.fecha_inicio).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const semanaActual = Math.ceil(diffDays / 7) || 1;

        for (const participante of tanda.participantes) {
            // Verificar si el participante ya hizo su pago de la semana actual
            const pagoSemana = await prisma.pago.findFirst({
                where: {
                    tanda_id: tanda.id,
                    usuario_id: participante.usuario_id,
                    numero_semana: semanaActual
                }
            });

            const diasParaVencer = 7 - (diffDays % 7);

            // 1. MOTOR DE RECORDATORIOS
            if (!pagoSemana) {
                if (diasParaVencer === 1) {
                    console.log(`[NOTIFICAR] ${participante.usuario.nombre}: Mañana te toca pagar 💸 No lo olvides.`);
                } else if (diasParaVencer === 0 || diasParaVencer === 7) {
                    console.log(`[NOTIFICAR] ${participante.usuario.nombre}: Hoy es tu turno de pagar en ${tanda.nombre}.`);
                } else if (diffDays % 7 > 0 && diasParaVencer < 0) { // Pasó la fecha límite
                    
                    // 3. SISTEMA DE PROTECCION AUTOMATICO (Si no pago y venció)
                    if (participante.estado !== 'atrasado') {
                        console.log(`[ALERTA] ${participante.usuario.nombre} falló el pago. Activando Fondo de Protección.`);
                        
                        // Restar del fondo de proteccion de la tanda
                        await prisma.tanda.update({
                            where: { id: tanda.id },
                            data: { saldo_fondo: { decrement: tanda.monto_semanal } }
                        });

                        // Marcar al usuario como atrasado en esta participacion
                        await prisma.participante.update({
                            where: { id: participante.id },
                            data: { estado: 'atrasado' }
                        });

                        // Penalizar reputacion
                        await penalizarUsuario(participante.usuario_id);
                        
                        // 2. PRESION SOCIAL
                        console.log(`[PRESION SOCIAL] Notificar al grupo de ${tanda.nombre}: El sistema cubrió la falla de ${participante.usuario.nombre}. Su reputación ha bajado considerablemente.`);
                    }
                }
            }
        }
    }
    console.log('[CRON] Fin de revision diaria.');
};

// Start simulating a cron job every 24 hours (86400000 ms)
// En produccion usar `node-cron`
setInterval(ejecutarCronDiario, 86400000);
