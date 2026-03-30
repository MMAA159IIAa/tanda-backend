import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Iniciando limpieza de datos de prueba...');
  
  // Borrar en orden para evitar errores de llave foránea
  await prisma.pago.deleteMany({})
  await prisma.participante.deleteMany({})
  await prisma.tanda.deleteMany({})
  
  // Opcional: Borrar usuarios excepto el admin
  await prisma.usuario.deleteMany({
    where: {
      NOT: {
        telefono: '6625827754'
      }
    }
  })

  console.log('✅ Base de datos limpia. Solo queda el Administrador.');
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
