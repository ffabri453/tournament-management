import { Router } from 'express';
import {
  generateNextTournamentRound,
  getTournament,
  getTournaments,
  postTournament,
  putTournament,
  removeTournament,
  startTournament,
} from '../controllers/tournamentController';

const router = Router();

router.get('/tournaments', getTournaments);
router.get('/tournaments/:id', getTournament);
router.post('/tournaments', postTournament);
router.post('/tournaments/:id/start', startTournament);
router.post('/tournaments/:id/next-round', generateNextTournamentRound);
router.put('/tournaments/:id', putTournament);
router.delete('/tournaments/:id', removeTournament);

export default router;
