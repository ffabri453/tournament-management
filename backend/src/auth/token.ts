import 'dotenv/config';
import jwt from 'jsonwebtoken';

export const tokenLifetimeSeconds = 60 * 60;

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  return secret;
};

export const issueToken = (userId: number): string => jwt.sign({}, getJwtSecret(), {
  algorithm: 'HS256', subject: String(userId), expiresIn: tokenLifetimeSeconds,
  issuer: 'tournament-management', audience: 'tournament-management',
});

export const verifyToken = (token: string): number => {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'], issuer: 'tournament-management', audience: 'tournament-management',
  });
  if (typeof payload === 'string' || !payload.sub || !/^[1-9]\d*$/.test(payload.sub) ||
      !Number.isSafeInteger(Number(payload.sub)) || typeof payload.exp !== 'number') {
    throw new Error('Invalid token payload');
  }
  return Number(payload.sub);
};
