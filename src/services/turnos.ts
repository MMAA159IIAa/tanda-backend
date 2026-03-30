import { prisma } from './prisma';

export const asignarTurnos = async (tandaId: string) => {
  // Fetch participants with their user details
  const participantes = await prisma.participante.findMany({
    where: { tanda_id: tandaId },
    include: { usuario: true }
  });

  // Sort logic: 
  // 1. Reputacion (desc)
  // 2. Puntos (desc)
  participantes.sort((a: any, b: any) => {
    if (b.usuario.reputacion !== a.usuario.reputacion) {
        return b.usuario.reputacion - a.usuario.reputacion;
    }
    return b.usuario.puntos - a.usuario.puntos;
  });

  // Assign posiciones
  for (let i = 0; i < participantes.length; i++) {
    const p: any = participantes[i];
    await prisma.participante.update({
      where: { id: p.id },
      data: { posicion_turno: i + 1 } // 1-indexed
    });
  }
};
