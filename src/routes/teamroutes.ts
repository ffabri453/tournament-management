import { Router } from 'express';
import {
  createNewTeam,
  deleteTeamById,
  getTeam,
  getTeams,
  updateExistingTeam
} from '../controllers/teamcontroller';

const router = Router();

router.get('/', getTeams);
router.get('/:id', getTeam);
router.post('/', createNewTeam);
router.put('/:id', updateExistingTeam);
router.delete('/:id', deleteTeamById);

export default router;