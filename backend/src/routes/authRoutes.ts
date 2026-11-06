import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ data: res.locals.user });
});

export default router;
