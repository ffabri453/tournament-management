import express, { NextFunction, Request, Response, Router } from 'express';
import {
  TEAM_LOGO_MAX_BYTES,
  createNewTeam,
  deleteTeamLogo,
  deleteTeamById,
  getTeam,
  getTeamLogoById,
  getTeams,
  updateTeamLogo,
  updateExistingTeam
} from '../controllers/teamcontroller';

const router = Router();

router.get('/', getTeams);
router.get('/:id/logo', getTeamLogoById);
router.put('/:id/logo', (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  express.raw({
    type: () => true,
    limit: TEAM_LOGO_MAX_BYTES
  })(req, res, (error?: unknown) => {
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
      res.status(413).json({ error: true, message: 'Team logo must not exceed 1 MB' });
      return;
    }
    if (error) {
      res.status(400).json({ error: true, message: 'Invalid team logo request' });
      return;
    }
    next();
  });
}, updateTeamLogo);
router.delete('/:id/logo', deleteTeamLogo);
router.get('/:id', getTeam);
router.post('/', createNewTeam);
router.put('/:id', updateExistingTeam);
router.delete('/:id', deleteTeamById);

export default router;
