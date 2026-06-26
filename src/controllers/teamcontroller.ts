import { Request, Response } from 'express';
import {
  createTeam,
  deleteTeam,
  getAllTeams,
  getTeamById,
  updateTeam,
  CreateTeamInput
} from '../models/teammodel';

const parseId = (value: string): number | null => {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
};

const validateTeamBody = (
  body: any
): {
  valid: boolean;
  message?: string;
  data?: CreateTeamInput;
} => {
  const { tournament_id, name, captain, city, players_count } = body;

  const parsedTournamentId = Number(tournament_id);
  const parsedPlayersCount = Number(players_count);

  if (
    tournament_id === undefined ||
    name === undefined ||
    captain === undefined ||
    city === undefined ||
    players_count === undefined
  ) {
    return {
      valid: false,
      message:
        'tournament_id, name, captain, city and players_count are required'
    };
  }

  if (!Number.isInteger(parsedTournamentId) || parsedTournamentId <= 0) {
    return {
      valid: false,
      message: 'tournament_id must be a positive integer'
    };
  }

  if (!Number.isInteger(parsedPlayersCount) || parsedPlayersCount <= 0) {
    return {
      valid: false,
      message: 'players_count must be a positive integer'
    };
  }

  if (
    String(name).trim() === '' ||
    String(captain).trim() === '' ||
    String(city).trim() === ''
  ) {
    return {
      valid: false,
      message: 'name, captain and city cannot be empty'
    };
  }

  return {
    valid: true,
    data: {
      tournament_id: parsedTournamentId,
      name: String(name).trim(),
      captain: String(captain).trim(),
      city: String(city).trim(),
      players_count: parsedPlayersCount
    }
  };
};

export const getTeams = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const teams = await getAllTeams();

    res.status(200).json({
      message: 'Teams retrieved successfully',
      data: teams
    });
  } catch (error: any) {
    res.status(500).json({
      error: true,
      message: 'Error getting teams',
      detail: error.message
    });
  }
};

export const getTeam = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      res.status(400).json({
        error: true,
        message: 'Invalid team id'
      });
      return;
    }

    const team = await getTeamById(id);

    if (!team) {
      res.status(404).json({
        error: true,
        message: 'Team not found'
      });
      return;
    }

    res.status(200).json({
      message: 'Team retrieved successfully',
      data: team
    });
  } catch (error: any) {
    res.status(500).json({
      error: true,
      message: 'Error getting team',
      detail: error.message
    });
  }
};

export const createNewTeam = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const validation = validateTeamBody(req.body);

    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: true,
        message: validation.message
      });
      return;
    }

    const team = await createTeam(validation.data);

    res.status(201).json({
      message: 'Team created successfully',
      data: team
    });
  } catch (error: any) {
    if (error.code === '23503') {
      res.status(400).json({
        error: true,
        message: 'The tournament_id does not exist'
      });
      return;
    }

    if (error.code === '23505') {
      res.status(400).json({
        error: true,
        message:
          'A team with the same name already exists in that tournament'
      });
      return;
    }

    if (error.code === '23514') {
      res.status(400).json({
        error: true,
        message: 'players_count must be greater than 0'
      });
      return;
    }

    res.status(500).json({
      error: true,
      message: 'Error creating team',
      detail: error.message
    });
  }
};

export const updateExistingTeam = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      res.status(400).json({
        error: true,
        message: 'Invalid team id'
      });
      return;
    }

    const validation = validateTeamBody(req.body);

    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: true,
        message: validation.message
      });
      return;
    }

    const updatedTeam = await updateTeam(id, validation.data);

    if (!updatedTeam) {
      res.status(404).json({
        error: true,
        message: 'Team not found'
      });
      return;
    }

    res.status(200).json({
      message: 'Team updated successfully',
      data: updatedTeam
    });
  } catch (error: any) {
    res.status(500).json({
      error: true,
      message: 'Error updating team',
      detail: error.message
    });
  }
};

export const deleteTeamById = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      res.status(400).json({
        error: true,
        message: 'Invalid team id'
      });
      return;
    }

    const deleted = await deleteTeam(id);

    if (!deleted) {
      res.status(404).json({
        error: true,
        message: 'Team not found'
      });
      return;
    }

    res.status(200).json({
      message: 'Team deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      error: true,
      message: 'Error deleting team',
      detail: error.message
    });
  }
};