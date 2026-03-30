import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.usuario.findMany({
    select: {
      id: true,
      nombre: true,
      telefono: true,
      email: true,
      password: true
    }
  })
  console.log(JSON.stringify(users, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
