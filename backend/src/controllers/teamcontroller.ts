import { Request, Response } from 'express';
import { respondWithAccessError } from '../middleware/accessError';
import {
  DomainError,
  hasOnlyFields,
  isNonNumericName,
  isPlainObject,
  isPositiveInteger
} from '../domain/competitionRules';
import {
  TeamInput,
  TeamLogoMimeType,
  createTeam,
  deleteTeam,
  getAllTeams,
  getTeamLogo,
  getTeamById,
  removeTeamLogo,
  saveTeamLogo,
  updateTeam
} from '../models/teammodel';

const teamFields = ['tournament_id', 'name', 'players_count'];
export const TEAM_LOGO_MAX_BYTES = 1024 * 1024;
export const TEAM_LOGO_MIME_TYPES: readonly TeamLogoMimeType[] = [
  'image/png', 'image/jpeg', 'image/webp'
];

const parseId = (value: string): number | null => {
  const id = Number(value);
  return isPositiveInteger(id) ? id : null;
};

export const detectTeamLogoMimeType = (data: Buffer): TeamLogoMimeType | null => {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ]))) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' &&
      data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
};

export const validateTeamLogo = (
  body: unknown,
  declaredMimeType: string | undefined
): { data?: Buffer; mimeType?: TeamLogoMimeType; status?: number; message?: string } => {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return { status: 400, message: 'Team logo file is required' };
  }
  if (body.length > TEAM_LOGO_MAX_BYTES) {
    return { status: 413, message: 'Team logo must not exceed 1 MB' };
  }
  const detectedMimeType = detectTeamLogoMimeType(body);
  const normalizedMimeType = declaredMimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!detectedMimeType || !TEAM_LOGO_MIME_TYPES.includes(normalizedMimeType as TeamLogoMimeType) ||
      detectedMimeType !== normalizedMimeType) {
    return { status: 415, message: 'Team logo must be a valid PNG, JPEG or WebP image' };
  }
  return { data: body, mimeType: detectedMimeType };
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
    errors.push('name must be a non-empty, non-numeric string of at most 100 characters');
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
  if (respondWithAccessError(error, res)) return;
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
    const team = await createTeam(validation.data, res.locals.user);
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
    const team = await updateTeam(id, validation.data, res.locals.user);
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

    const deleted = await deleteTeam(id, res.locals.user);
    if (!deleted) {
      res.status(404).json({ error: true, message: 'Team not found' });
      return;
    }

    res.status(200).json({ message: 'Team deleted successfully' });
  } catch (error) {
    respondWithTeamError(error, res, 'Error deleting team');
  }
};

export const getTeamLogoById = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid team id' });
    return;
  }
  try {
    const logo = await getTeamLogo(id);
    if (!logo) {
      res.status(404).json({ error: true, message: 'Team logo not found' });
      return;
    }
    res.set('Content-Type', logo.mime_type);
    res.set('Cache-Control', 'private, max-age=300');
    res.status(200).send(logo.data);
  } catch {
    res.status(500).json({ error: true, message: 'Error getting team logo' });
  }
};

export const updateTeamLogo = async (
  req: Request<{ id: string }, unknown, Buffer>,
  res: Response
): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid team id' });
    return;
  }
  const validation = validateTeamLogo(req.body, req.get('Content-Type'));
  if (!validation.data || !validation.mimeType) {
    res.status(validation.status ?? 400).json({ error: true, message: validation.message });
    return;
  }
  try {
    const saved = await saveTeamLogo(id, {
      data: validation.data,
      mime_type: validation.mimeType
    }, res.locals.user);
    if (!saved) {
      res.status(404).json({ error: true, message: 'Team not found' });
      return;
    }
    res.status(200).json({
      message: 'Team logo updated successfully',
      data: { team_id: id, has_logo: true }
    });
  } catch (error) {
    if (respondWithAccessError(error, res)) return;
    res.status(500).json({ error: true, message: 'Error updating team logo' });
  }
};

export const deleteTeamLogo = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: true, message: 'Invalid team id' });
    return;
  }
  try {
    const removed = await removeTeamLogo(id, res.locals.user);
    if (!removed) {
      res.status(404).json({ error: true, message: 'Team not found' });
      return;
    }
    res.status(200).json({
      message: 'Team logo removed successfully',
      data: { team_id: id, has_logo: false }
    });
  } catch (error) {
    if (respondWithAccessError(error, res)) return;
    res.status(500).json({ error: true, message: 'Error removing team logo' });
  }
};
