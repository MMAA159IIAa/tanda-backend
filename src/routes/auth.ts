import { Router } from 'express';
import { prisma } from '../services/prisma';
import crypto from 'crypto';

const router = Router();

// Basic hash function for MVP
const hashPassword = (password: string) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

router.post('/register', async (req, res) => {
  try {
    const { nombre, telefono, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await prisma.usuario.findFirst({
      where: {
        OR: [{ email }, { telefono }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const newUser = await prisma.usuario.create({
      data: {
        nombre,
        telefono,
        email,
        password: hashPassword(password),
        codigo_invitacion: crypto.randomBytes(4).toString('hex').toUpperCase(),
        nivel: 'basico'
      }
    });

    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { telefono, password } = req.body;
    
    if (!telefono || !password) {
      return res.status(400).json({ error: 'Faltan credenciales' });
    }

    const user = await prisma.usuario.findUnique({ 
      where: { telefono } 
    });

    if (!user || user.password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // MVP: Just returning the user object context. 
    res.json({ message: 'Logged in successfully', user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Implementacion de Olvido Contraseña para MVP
// Endpoint de EMERGENCIA (Cambiado a GET para que el usuario solo le de click)
router.get('/reset-admin-emergency', async (req, res) => {
  try {
    const telefono = '6625827754';
    const newPass = 'Maria1601';
    
    await prisma.usuario.upsert({
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
    });

    res.json({ message: 'Cuenta de Administrador reseteada con éxito a Maria1601' });
  } catch (error) {
    res.status(500).json({ error: 'Error en reset de emergencia' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { telefono } = req.body;
    if (!telefono) return res.status(400).json({ error: 'Teléfono requerido' });

    const user = await prisma.usuario.findUnique({ where: { telefono } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Por MVP y para que el usuario pueda seguir, reseteamos a una temporal
    // o simplemente enviamos un mensaje de éxito simulando el envío de SMS/Email
    const tempPass = "Reset1234";
    await prisma.usuario.update({
      where: { telefono },
      data: { password: hashPassword(tempPass) }
    });

    res.json({ message: 'Se ha enviado un código de recuperación a tu número. Contraseña temporal: Reset1234' });
  } catch (error) {
    res.status(500).json({ error: 'Error procesando solicitud' });
  }
});

export default router;
