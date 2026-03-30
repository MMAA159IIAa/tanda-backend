import { prisma } from './prisma';

// 6. IA DE RIESGO y 5. MOTOR DE REPUTACION
export const calcularNivelYRiesgo = async (usuarioId: string) => {
  const user = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!user) return null;

  // Calculo de Riesgo Base
  let riesgo = 'bajo';
  if (user.pagos_tardios > 0 || user.reputacion < 70) riesgo = 'medio';
  if (user.pagos_tardios > 2 || user.reputacion < 40) riesgo = 'alto';

  // Calculo de Nivel
  let nivel = 'basico';
  if (user.puntos >= 100) nivel = 'medio';
  if (user.puntos >= 300) nivel = 'pro';
  if (user.puntos >= 700) nivel = 'premium';

  // Antifraude: Bloqueo Severo
  if (user.reputacion < 30) {
      // Logic to block user from joining new tandas
      await prisma.usuario.update({
          where: { id: user.id },
          data: { nivel: 'bloqueado' } 
      });
  } else if (user.nivel !== nivel) {
      await prisma.usuario.update({
          where: { id: user.id },
          data: { nivel }
      });
  }

  return { nivel, riesgo, reputacion: user.reputacion };
};

export const penalizarUsuario = async (usuarioId: string) => {
    await prisma.usuario.update({
        where: { id: usuarioId },
        data: {
            reputacion: { decrement: 20 },
            puntos: { decrement: 20 },
            pagos_tardios: { increment: 1 }
        }
    });
    await calcularNivelYRiesgo(usuarioId);
};

export const premiarUsuario = async (usuarioId: string, motivo: 'pago' | 'tanda_completada' | 'referido') => {
    let puntosSuma = 0;
    if (motivo === 'pago') puntosSuma = 10;
    if (motivo === 'referido') puntosSuma = 30;
    if (motivo === 'tanda_completada') puntosSuma = 50;

    await prisma.usuario.update({
        where: { id: usuarioId },
        data: {
            puntos: { increment: puntosSuma },
            pagos_puntuales: motivo === 'pago' ? { increment: 1 } : undefined,
            // Recuperacion de reputacion si ha sido puntual
            reputacion: { increment: motivo === 'pago' ? 2 : 5 } 
        }
    });
    
    // Cap reputation at 100
    const user = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (user && user.reputacion > 100) {
        await prisma.usuario.update({ where: { id: usuarioId }, data: { reputacion: 100 } });
    }

    await calcularNivelYRiesgo(usuarioId);
};
