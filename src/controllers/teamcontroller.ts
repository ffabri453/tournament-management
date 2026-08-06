import { Request, Response } from 'express';
import {
  DomainError,
  hasOnlyFields,
  isNonNumericName,
  isPlainObject,
  isPositiveInteger
} from '../domain/competitionRules';
import {
  TeamInput,
  createTeam,
  deleteTeam,
  getAllTeams,
  getTeamById,
  updateTeam
} from '../models/teammodel';

const teamFields = ['tournament_id', 'name', 'players_count'];

const parseId = (value: string): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const validateTeamBody = (
  body: unknown
): { data?: TeamInput; errors: string[] } => {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors: string[] = [];
  const unknownFields = hasOnlyFields(body, teamFields);
  if (unknownFields.length > 0) {
    errors.push(`Unknown fields: ${unknownFields.join(', ')}`);
  }

  for (const field of teamFields) {
    if (body[field] === undefined) errors.push(`${field} is required`);
  }

  if (!isPositiveInteger(body.tournament_id)) {
    errors.push('tournament_id must be a positive integer');
  }
  if (!isNonNumericName(body.name)) {
    errors.push('name must be a non-empty, non-numeric string');
  }
  if (!isPositiveInteger(body.players_count)) {
    errors.push('players_count must be a positive integer');
  }

  if (errors.length > 0) return { errors };

  return {
    errors,
    data: {
      tournament_id: body.tournament_id as number,
      name: (body.name as string).trim(),
      players_count: body.players_count as number
    }
  };
};

const respondWithTeamError = (error: any, res: Response, fallback: string): void => {
  if (error instanceof DomainError) {
    const status = error.code === 'TOURNAMENT_NOT_FOUND' ? 404 :
      error.code === 'INVALID_PLAYERS_COUNT_FOR_MODALITY' ? 400 : 409;
    res.status(status).json({ error: true, message: error.message });
    return;
  }

  if (error?.code === '23505') {
    res.status(409).json({
      error: true,
      message: 'A team with the same name already exists in that tournament'
    });
    return;
  }

  if (error?.code === '23503') {
    res.status(409).json({
      error: true,
      message: 'The team cannot be changed because it is referenced by a match'
    });
    return;
  }

  if (error?.code === '23514') {
    res.status(400).json({ error: true, message: 'Team data violates a domain rule' });
    return;
  }

  res.status(500).json({ error: true, message: fallback });
};

export const getTeams = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      message: 'Teams retrieved successfully',
      data: await getAllTeams()
    });
  } catch {
    res.status(500).json({ error: true, message: 'Error getting teams' });
  }
};

export const getTeam = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: true, message: 'Invalid team id' });
      return;
    }

    const team = await getTeamById(id);
    if (!team) {
      res.status(404).json({ error: true, message: 'Team not found' });
      return;
    }

    res.status(200).json({ message: 'Team retrieved successfully', data: team });
  } catch {
    res.status(500).json({ error: true, message: 'Error getting team' });
  }
};

export const createNewTeam = async (req: Request, res: Response): Promise<void> => {
  const validation = validateTeamBody(req.body);
  if (!validation.data) {
    res.status(400).json({
      error: true,
      message: 'Invalid team data',
      errors: validation.errors
    });
    return;
  }

  try {
    const team = await createTeam(validation.data);
    res.status(201).json({ message: 'Team created successfully', data: team });
  } catch (error) {
    respondWithTeamError(error, res, 'Error creating team');
  }
};

export const updateExistingTeam = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid team id' });
    return;
  }

  const validation = validateTeamBody(req.body);
  if (!validation.data) {
    res.status(400).json({
      error: true,
      message: 'Invalid team data',
      errors: validation.errors
    });
    return;
  }

  try {
    const team = await updateTeam(id, validation.data);
    if (!team) {
      res.status(404).json({ error: true, message: 'Team not found' });
      return;
    }

    res.status(200).json({ message: 'Team updated successfully', data: team });
  } catch (error) {
    respondWithTeamError(error, res, 'Error updating team');
  }
};

export const deleteTeamById = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: true, message: 'Invalid team id' });
      return;
    }

    const deleted = await deleteTeam(id);
    if (!deleted) {
      res.status(404).json({ error: true, message: 'Team not found' });
      return;
    }

    res.status(200).json({ message: 'Team deleted successfully' });
  } catch (error) {
    respondWithTeamError(error, res, 'Error deleting team');
  }
};
