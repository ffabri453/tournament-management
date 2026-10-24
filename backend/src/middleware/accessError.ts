import { Response } from 'express';
import { DomainError } from '../domain/competitionRules';

export const respondWithAccessError = (error: unknown, res: Response): boolean => {
  if (!(error instanceof DomainError)) return false;
  const status = error.code === 'AUTHENTICATION_REQUIRED' ? 401 :
    error.code === 'TOURNAMENT_ACCESS_DENIED' ? 403 : null;
  if (status === null) return false;
  res.status(status).json({ error: true, message: error.message });
  return true;
};
