import express, { Request, Response } from 'express';
import pool from './src/config/db';

import tournamentRoutes from './src/routes/tournamentRoutes';
import matchRoutes from './src/routes/matchRoutes';
import teamroutes from './src/routes/teamroutes';
import authRoutes from './src/routes/authRoutes';
import { authenticate } from './src/middleware/authenticate';
import { getJwtSecret } from './src/auth/token';

export const app = express();
getJwtSecret();

app.use(express.json());

app.use(['/tournaments', '/matches', '/api/teams'], authenticate);
app.use(tournamentRoutes);
app.use(matchRoutes);
app.use('/api/teams', teamroutes);
app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3000;

// Ruta base
app.get('/', (req: Request, res: Response) => {
  res.send('Backend is working');
});

// Ruta de prueba de la base de datos
app.get('/db-test', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.json({
      ok: true,
      message: 'PostgreSQL connection successful',
      time: result.rows[0],
    });
  } catch {
    res.status(500).json({
      ok: false,
      message: 'PostgreSQL connection failed',
    });
  }
});

// Escuchar puerto
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
