import { Request, Response } from 'express';
import {
  DomainError,
  RULES_BY_MODALITY,
  TOURNAMENT_CAPACITIES,
  TOURNAMENT_LOCATIONS,
  TOURNAMENT_MODALITIES,
  TOURNAMENT_STATUSES,
  hasOnlyFields,
  isNonNumericName,
  isPlainObject,
  parseMatchDate
} from '../domain/competitionRules';
import {
  CreateTournamentInput,
  StartTournamentInput,
  UpdateTournamentInput,
  advanceTournamentRound,
  createTournament,
  deleteTournament,
  getAllTournaments,
  getTournamentById,
  startTournament as startTournamentModel,
  updateTournament
} from '../models/Tournament';

const createFields = ['name', 'location', 'rules', 'format', 'modality', 'max_teams', 'status'];
const updateFields = ['name', 'location', 'format', 'modality', 'max_teams', 'status'];
const startFields = ['match_date'];

const parseId = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const validateTournament = (
  body: unknown,
  partial: boolean
): { data?: CreateTournamentInput | UpdateTournamentInput; errors: string[] } => {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors: string[] = [];
  const data: UpdateTournamentInput = {};
  const unknownFields = hasOnlyFields(body, partial ? updateFields : createFields);

  if (unknownFields.length > 0) {
    errors.push(`Unknown fields: ${unknownFields.join(', ')}`);
  }

  if (partial && Object.keys(body).length === 0) {
    errors.push('Request body cannot be empty');
  }

  const required = ['name', 'location', 'rules', 'format', 'modality', 'max_teams'];
  if (!partial) {
    for (const field of required) {
      if (body[field] === undefined) errors.push(`${field} is required`);
    }
  }

  if (body.name !== undefined) {
    if (!isNonNumericName(body.name)) {
      errors.push('name must be a non-empty, non-numeric string');
    } else {
      data.name = body.name.trim();
    }
  }

  if (body.location !== undefined) {
    const location = typeof body.location === 'string' ? body.location.trim() : body.location;
    if (!TOURNAMENT_LOCATIONS.includes(location as never)) {
      errors.push(`location must be one of: ${TOURNAMENT_LOCATIONS.join(', ')}`);
    } else {
      data.location = location as CreateTournamentInput['location'];
    }
  }

  if (body.format !== undefined) {
    if (body.format !== 'knockout') {
      errors.push('format must be knockout');
    } else {
      data.format = 'knockout';
    }
  }

  if (body.modality !== undefined) {
    if (!TOURNAMENT_MODALITIES.includes(body.modality as never)) {
      errors.push(`modality must be one of: ${TOURNAMENT_MODALITIES.join(', ')}`);
    } else {
      data.modality = body.modality as CreateTournamentInput['modality'];
    }
  }

  if (!partial && body.rules !== undefined) {
    const modality = body.modality as CreateTournamentInput['modality'];
    const expectedRules = RULES_BY_MODALITY[modality];

    if (typeof body.rules !== 'string' || !expectedRules || body.rules !== expectedRules) {
      errors.push(
        `rules must match modality: futbol_5=${RULES_BY_MODALITY.futbol_5}, ` +
        `futbol_7=${RULES_BY_MODALITY.futbol_7}, futbol_11=${RULES_BY_MODALITY.futbol_11}`
      );
    }
  }

  if (body.max_teams !== undefined) {
    if (
      typeof body.max_teams !== 'number' ||
      !TOURNAMENT_CAPACITIES.includes(body.max_teams as never)
    ) {
      errors.push(`max_teams must be one of: ${TOURNAMENT_CAPACITIES.join(', ')}`);
    } else {
      data.max_teams = body.max_teams as CreateTournamentInput['max_teams'];
    }
  }

  if (body.status !== undefined) {
    if (!TOURNAMENT_STATUSES.includes(body.status as never)) {
      errors.push(`status must be one of: ${TOURNAMENT_STATUSES.join(', ')}`);
    } else {
      data.status = body.status as CreateTournamentInput['status'];
    }
  } else if (!partial) {
    data.status = 'open';
  }

  if (errors.length > 0) return { errors };
  return { data, errors };
};

export const validateStartTournamentBody = (
  body: unknown,
  now = new Date()
): { data?: StartTournamentInput; errors: string[] } => {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors: string[] = [];
  const unknownFields = hasOnlyFields(body, startFields);
  if (unknownFields.length > 0) {
    errors.push(`Unknown fields: ${unknownFields.join(', ')}`);
  }

  if (body.match_date === undefined) {
    errors.push('match_date is required');
  }

  const matchDate = parseMatchDate(body.match_date);
  if (!matchDate) {
    errors.push('match_date must use YYYY-MM-DD HH:mm (for example, 2026-08-09 17:00)');
  } else if (matchDate <= now) {
    errors.push('match_date must be in the future');
  }

  if (errors.length > 0 || !matchDate) return { errors };

  return {
    errors,
    data: { match_date: matchDate }
  };
};

const respondWithWriteError = (
  error: any,
  res: Response,
  fallbackMessage: string
): void => {
  if (
    error?.code === '23505' &&
    error?.constraint === 'unique_tournament_name_location'
  ) {
    res.status(409).json({
      error: true,
      message: 'A tournament with the same name already exists in that location'
    });
    return;
  }

  if (error instanceof DomainError) {
    res.status(409).json({ error: true, message: error.message });
    return;
  }

  if (error?.code === '23514') {
    res.status(400).json({ error: true, message: 'Tournament data violates a domain rule' });
    return;
  }

  res.status(500).json({ error: true, message: fallbackMessage });
};

const respondWithStartError = (error: unknown, res: Response): void => {
  if (!(error instanceof DomainError)) {
    res.status(500).json({ error: true, message: 'Error starting tournament' });
    return;
  }

  if (error.code === 'TOURNAMENT_NOT_FOUND') {
    res.status(404).json({ error: true, message: error.message });
    return;
  }

  const conflictCodes = [
    'TOURNAMENT_NOT_OPEN',
    'TOURNAMENT_MATCHES_ALREADY_EXIST'
  ];
  const status = conflictCodes.includes(error.code) ? 409 : 400;
  res.status(status).json({ error: true, message: error.message });
};

const respondWithRoundAdvanceError = (error: unknown, res: Response): void => {
  if (!(error instanceof DomainError)) {
    res.status(500).json({ error: true, message: 'Error generating next tournament round' });
    return;
  }

  if (error.code === 'TOURNAMENT_NOT_FOUND') {
    res.status(404).json({ error: true, message: error.message });
    return;
  }

  const conflictCodes = [
    'TOURNAMENT_NOT_IN_PROGRESS',
    'TOURNAMENT_MATCHES_NOT_FOUND',
    'CURRENT_ROUND_INCOMPLETE',
    'NEXT_ROUND_ALREADY_EXISTS',
    'TOURNAMENT_ALREADY_AT_FINAL'
  ];
  const status = conflictCodes.includes(error.code) ? 409 : 400;
  res.status(status).json({ error: true, message: error.message });
};

export const getTournaments = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json(await getAllTournaments());
  } catch {
    res.status(500).json({ error: true, message: 'Error getting tournaments' });
  }
};

export const getTournament = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: true, message: 'Invalid tournament id' });
      return;
    }

    const tournament = await getTournamentById(id);
    if (!tournament) {
      res.status(404).json({ error: true, message: 'Tournament not found' });
      return;
    }

    res.status(200).json(tournament);
  } catch {
    res.status(500).json({ error: true, message: 'Error getting tournament' });
  }
};

export const postTournament = async (req: Request, res: Response): Promise<void> => {
  const validation = validateTournament(req.body, false);
  if (!validation.data) {
    res.status(400).json({
      error: true,
      message: 'Invalid tournament data',
      errors: validation.errors
    });
    return;
  }

  try {
    const tournament = await createTournament(validation.data as CreateTournamentInput);
    res.status(201).json(tournament);
  } catch (error) {
    respondWithWriteError(error, res, 'Error creating tournament');
  }
};

export const startTournament = async (req: Request, res: Response): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid tournament id' });
    return;
  }

  const validation = validateStartTournamentBody(req.body);
  if (!validation.data) {
    res.status(400).json({
      error: true,
      message: 'Invalid tournament start data',
      errors: validation.errors
    });
    return;
  }

  try {
    const result = await startTournamentModel(id, validation.data);
    res.status(201).json({
      message: 'Tournament started successfully',
      data: result
    });
  } catch (error) {
    respondWithStartError(error, res);
  }
};

export const generateNextTournamentRound = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid tournament id' });
    return;
  }

  const validation = validateStartTournamentBody(req.body);
  if (!validation.data) {
    res.status(400).json({
      error: true,
      message: 'Invalid next round data',
      errors: validation.errors
    });
    return;
  }

  try {
    const result = await advanceTournamentRound(id, validation.data);
    res.status(201).json({
      message: 'Next round generated successfully',
      data: result
    });
  } catch (error) {
    respondWithRoundAdvanceError(error, res);
  }
};

export const putTournament = async (req: Request, res: Response): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid tournament id' });
    return;
  }

  const validation = validateTournament(req.body, true);
  if (!validation.data) {
    res.status(400).json({
      error: true,
      message: 'Invalid tournament data',
      errors: validation.errors
    });
    return;
  }

  try {
    const tournament = await updateTournament(id, validation.data);
    if (!tournament) {
      res.status(404).json({ error: true, message: 'Tournament not found' });
      return;
    }

    res.status(200).json(tournament);
  } catch (error) {
    respondWithWriteError(error, res, 'Error updating tournament');
  }
};

export const removeTournament = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: true, message: 'Invalid tournament id' });
      return;
    }

    const tournament = await deleteTournament(id);
    if (!tournament) {
      res.status(404).json({ error: true, message: 'Tournament not found' });
      return;
    }

    res.status(200).json({ message: 'Tournament deleted successfully' });
  } catch {
    res.status(500).json({ error: true, message: 'Error deleting tournament' });
  }
};
