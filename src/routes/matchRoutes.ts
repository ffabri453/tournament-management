import { Router } from 'express';

import {
  getMatches,
  getMatch,
  addMatch,
  removeMatch,
  editMatch
} from '../controllers/matchController';

const router = Router();

router.get('/matches', getMatches);

router.get('/matches/:id', getMatch);

router.post('/matches', addMatch);

router.delete('/matches/:id', removeMatch);

router.put('/matches/:id', editMatch);

export default router;