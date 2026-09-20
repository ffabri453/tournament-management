import { Router } from 'express';
import {
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
router.put('/tournaments/:id', putTournament);
router.delete('/tournaments/:id', removeTournament);

export default router;
