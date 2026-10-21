import { RequestHandler } from 'express';
import { verifyToken } from '../auth/token';
import { findUserById } from '../models/User';

export const authenticate: RequestHandler = async (req, res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '');
  let userId: number;
  try {
    if (!match?.[1]) throw new Error('Missing token');
    userId = verifyToken(match[1]);
  } catch {
    res.status(401).json({ error: true, message: 'Authentication required' });
    return;
  }
  try {
    const user = await findUserById(userId);
    if (!user) {
      res.status(401).json({ error: true, message: 'Authentication required' });
      return;
    }
    res.locals.user = user;
    next();
  } catch {
    res.status(500).json({ error: true, message: 'Error authenticating user' });
  }
};
