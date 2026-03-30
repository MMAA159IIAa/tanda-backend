import express from 'express';
import cors from 'cors';
import { prisma } from './services/prisma';
import './services/automations';
import { asegurarTandasSistema } from './routes/admin';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

app.use((req, res, next) => {
  console.log(`>>> RECIBIDO: ${req.method} en ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth').default);
app.use('/api/tandas', require('./routes/tandas').default);
app.use('/api/pagos', require('./routes/pagos').default);
app.use('/api/admin', require('./routes/admin').default);
app.use('/api/webhooks', require('./routes/webhooks').default);

const PORT = parseInt(process.env.PORT as string) || 3000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Cerebro Backend (Tanda Confiable) corriendo en puerto ${PORT}`);
  console.log(`Motor de Automatizaciones ON ✅`);
  // Crear las 5 tandas estándar si no existen
  await asegurarTandasSistema();
  console.log(`🏦 Tandas del Sistema: Verificadas ✅`);
});
