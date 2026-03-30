import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

const hashPassword = (password: string) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

async function main() {
  const telefono = '6625827754';
  const newPass = 'Maria1601';
  
  const user = await prisma.usuario.upsert({
    where: { telefono },
    update: { password: hashPassword(newPass) },
    create: {
      nombre: 'Administrador',
      telefono,
      email: 'admin@tandaconfiable.com',
      password: hashPassword(newPass),
      codigo_invitacion: 'ADMIN-ROOT',
      nivel: 'premium'
    }
  })
  
  console.log('✅ Admin user updated/created:', user.telefono);
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
