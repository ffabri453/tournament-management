import { Request, Response } from 'express';
import {
  DomainError,
  MATCH_ROUNDS,
  MATCH_STATUSES,
  ROUNDS_BY_CAPACITY,
  hasOnlyFields,
  isNonNumericName,
  isPlainObject,
  isPositiveInteger,
  parseMatchDate
} from '../domain/competitionRules';
import {
  MatchInput,
  createManualMatch,
  deleteMatch,
  getAllMatches,
  getMatchById,
  getMatchValidationContext,
  updateMatch
} from '../models/Match';

const matchFields = [
  'tournament_id',
  'home_team_id',
  'away_team_id',
  'match_date',
  'location',
  'round',
  'home_goals',
  'away_goals',
  'home_penalties',
  'away_penalties',
  'winner_team_id',
  'status'
];

const parseId = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseGoals = (
  value: unknown,
  field: string,
  errors: string[]
): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(`${field} must be null or a non-negative integer`);
    return null;
  }
  return value;
};

const matchDateError =
  'match_date must use YYYY-MM-DD HH:mm (for example, 2026-08-09 17:00)';

export { parseMatchDate };

export const validateMatchBody = (
  body: unknown,
  now = new Date()
): { data?: MatchInput; errors: string[] } => {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors: string[] = [];
  const unknownFields = hasOnlyFields(body, matchFields);
  if (unknownFields.length > 0) {
    errors.push(`Unknown fields: ${unknownFields.join(', ')}`);
  }

  const requiredFields = [
    'tournament_id',
    'home_team_id',
    'away_team_id',
    'match_date',
    'location',
    'round'
  ];
  for (const field of requiredFields) {
    if (body[field] === undefined) errors.push(`${field} is required`);
  }

  for (const field of ['tournament_id', 'home_team_id', 'away_team_id']) {
    if (!isPositiveInteger(body[field])) {
      errors.push(`${field} must be a positive integer`);
    }
  }

  if (
    isPositiveInteger(body.home_team_id) &&
    isPositiveInteger(body.away_team_id) &&
    body.home_team_id === body.away_team_id
  ) {
    errors.push('home_team_id and away_team_id must be different');
  }

  const matchDate = parseMatchDate(body.match_date);
  if (!matchDate) {
    errors.push(matchDateError);
  }

  if (!isNonNumericName(body.location)) {
    errors.push('location must be a non-empty, non-numeric string');
  }

  if (!MATCH_ROUNDS.includes(body.round as never)) {
    errors.push(`round must be one of: ${MATCH_ROUNDS.join(', ')}`);
  }

  const status = body.status ?? 'scheduled';
  if (!MATCH_STATUSES.includes(status as never)) {
    errors.push(`status must be one of: ${MATCH_STATUSES.join(', ')}`);
  }

  const homeGoals = parseGoals(body.home_goals, 'home_goals', errors);
  const awayGoals = parseGoals(body.away_goals, 'away_goals', errors);
  const homePenalties = parseGoals(body.home_penalties, 'home_penalties', errors);
  const awayPenalties = parseGoals(body.away_penalties, 'away_penalties', errors);
  const hasPenalties = homePenalties !== null || awayPenalties !== null;
  let winnerTeamId: number | null = null;

  if (status === 'scheduled') {
    if (homeGoals !== null || awayGoals !== null || hasPenalties || body.winner_team_id != null) {
      errors.push('scheduled matches cannot have goals, penalties or a winner');
    }
    if (matchDate && matchDate <= now) {
      errors.push('a scheduled match must have a future match_date');
    }
  }

  if (status === 'live') {
    if (homeGoals === null || awayGoals === null) {
      errors.push('live matches require home_goals and away_goals');
    }
    if (body.winner_team_id != null) {
      errors.push('live matches cannot have a winner');
    }
    if (hasPenalties) {
      errors.push('live matches cannot have penalties');
    }
  }

  if (status === 'suspended') {
    if ((homeGoals === null) !== (awayGoals === null)) {
      errors.push('suspended matches must provide both goal values or neither');
    }
    if (body.winner_team_id != null) {
      errors.push('suspended matches cannot have a winner');
    }
    if (hasPenalties) {
      errors.push('suspended matches cannot have penalties');
    }
  }

  if (status === 'finished') {
    if (homeGoals === null || awayGoals === null) {
      errors.push('finished matches require home_goals and away_goals');
    } else if (homeGoals !== awayGoals) {
      if (hasPenalties) {
        errors.push('penalties are only allowed when regular goals are tied');
      }
      winnerTeamId = homeGoals > awayGoals
        ? body.home_team_id as number
        : body.away_team_id as number;
    } else if (homePenalties === null || awayPenalties === null) {
      errors.push('tied finished matches require home_penalties and away_penalties');
    } else if (homePenalties === awayPenalties) {
      errors.push('home_penalties and away_penalties must be different');
    } else {
      winnerTeamId = homePenalties > awayPenalties
        ? body.home_team_id as number
        : body.away_team_id as number;
    }

    if (winnerTeamId !== null) {
      if (
        body.winner_team_id !== undefined &&
        body.winner_team_id !== winnerTeamId
      ) {
        errors.push('winner_team_id does not match the match result');
      }
    }
    if (matchDate && matchDate > now) {
      errors.push('a finished match cannot have a future match_date');
    }
  }

  if (errors.length > 0 || !matchDate) return { errors };

  return {
    errors,
    data: {
      tournament_id: body.tournament_id as number,
      home_team_id: body.home_team_id as number,
      away_team_id: body.away_team_id as number,
      match_date: matchDate,
      location: (body.location as string).trim(),
      round: body.round as MatchInput['round'],
      home_goals: homeGoals,
      away_goals: awayGoals,
      home_penalties: homePenalties,
      away_penalties: awayPenalties,
      winner_team_id: winnerTeamId,
      status: status as MatchInput['status']
    }
  };
};

const validateMatchRelationships = async (
  match: MatchInput,
  excludedMatchId: number | null
): Promise<string[]> => {
  const context = await getMatchValidationContext(
    match.tournament_id,
    match.home_team_id,
    match.away_team_id,
    match.round,
    excludedMatchId
  );

  if (!context) return ['tournament_id does not exist'];

  const errors: string[] = [];
  if (!context.home_team_exists) {
    errors.push('home_team_id does not exist in the selected tournament');
  }
  if (!context.away_team_exists) {
    errors.push('away_team_id does not exist in the selected tournament');
  }
  const allowedRounds = ROUNDS_BY_CAPACITY[context.max_teams];
  if (!allowedRounds || !allowedRounds.includes(match.round)) {
    errors.push(`round is not valid for a ${context.max_teams}-team tournament`);
  }
  if (context.team_round_conflict) {
    errors.push('A team cannot play more than one match in the same round');
  }
  return errors;
};

const respondWithMatchWriteError = (error: any, res: Response, fallback: string): void => {
  if (error instanceof DomainError) {
    const status = error.code === 'TOURNAMENT_NOT_FOUND' ? 404 : 409;
    res.status(status).json({ error: true, message: error.message });
    return;
  }

  if (error?.code === '23505') {
    res.status(409).json({
      error: true,
      message: 'The same teams already have a match in that round'
    });
    return;
  }
  if (error?.code === '23503' || error?.code === '23514') {
    res.status(400).json({ error: true, message: 'Match data violates a domain rule' });
    return;
  }
  res.status(500).json({ error: true, message: fallback });
};

export const getMatches = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({ message: 'List of matches', data: await getAllMatches() });
  } catch {
    res.status(500).json({ error: true, message: 'Error getting matches' });
  }
};

export const getMatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: true, message: 'Invalid match id' });
      return;
    }
    const match = await getMatchById(id);
    if (!match) {
      res.status(404).json({ error: true, message: 'Match not found' });
      return;
    }
    res.status(200).json({ data: match });
  } catch {
    res.status(500).json({ error: true, message: 'Error getting match' });
  }
};

const writeMatch = async (
  req: Request,
  res: Response,
  id?: number
): Promise<void> => {
  const validation = validateMatchBody(req.body);
  if (!validation.data) {
    res.status(400).json({ error: true, message: 'Invalid match data', errors: validation.errors });
    return;
  }

  try {
    const relationshipErrors = await validateMatchRelationships(validation.data, id ?? null);
    if (relationshipErrors.length > 0) {
      res.status(400).json({
        error: true,
        message: 'Invalid match relationships',
        errors: relationshipErrors
      });
      return;
    }

    const match = id === undefined
      ? await createManualMatch(validation.data)
      : await updateMatch(id, validation.data);

    if (!match) {
      res.status(404).json({ error: true, message: 'Match not found' });
      return;
    }

    res.status(id === undefined ? 201 : 200).json({
      message: id === undefined ? 'Match created' : 'Match updated',
      data: match
    });
  } catch (error) {
    respondWithMatchWriteError(
      error,
      res,
      id === undefined ? 'Error creating match' : 'Error updating match'
    );
  }
};

export const addMatch = async (req: Request, res: Response): Promise<void> => {
  await writeMatch(req, res);
};

export const editMatch = async (req: Request, res: Response): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid match id' });
    return;
  }
  await writeMatch(req, res, id);
};

export const removeMatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: true, message: 'Invalid match id' });
      return;
    }
    if (!await deleteMatch(id)) {
      res.status(404).json({ error: true, message: 'Match not found' });
      return;
    }
    res.status(200).json({ message: 'Match deleted' });
  } catch (error) {
    respondWithMatchWriteError(error, res, 'Error deleting match');
  }
};
