import { Request, Response } from 'express';

import {
  getAllMatches,
  getMatchById,
  createMatch,
  deleteMatch,
  updateMatch
} from '../models/Match';

export const getMatches = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const matches = await getAllMatches();

    res.status(200).json({
      message: 'List of matches',
      data: matches
    });

  } catch (error: any) {

    res.status(500).json({
      error: true,
      message: 'Error getting matches',
      detail: error.message
    });

  }
};

export const getMatch = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: true,
        message: 'Invalid match id'
      });
      return;
    }

    const match = await getMatchById(id);

    if (!match) {
      res.status(404).json({
        error: true,
        message: 'Match not found'
      });
      return;
    }

    res.status(200).json({
      data: match
    });

  } catch (error: any) {

    res.status(500).json({
      error: true,
      message: error.message
    });

  }
};

export const addMatch = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const {
      tournament_id,
      home_team_id,
      away_team_id,
      match_date,
      location,
      round,
      status
    } = req.body;

    if (
      !tournament_id ||
      !home_team_id ||
      !away_team_id ||
      !match_date ||
      !location ||
      !round
    ) {

      res.status(400).json({
        error: true,
        message: 'Missing required fields'
      });

      return;
    }

    const match = await createMatch(
      tournament_id,
      home_team_id,
      away_team_id,
      match_date,
      location,
      round,
      status || 'scheduled'
    );

    res.status(201).json({
      message: 'Match created',
      data: match
    });

  } catch (error: any) {

    res.status(500).json({
      error: true,
      message: error.message
    });

  }
};

export const editMatch = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: true,
        message: 'Invalid match id'
      });
      return;
    }

    const {
      tournament_id,
      home_team_id,
      away_team_id,
      match_date,
      location,
      round,
      home_goals,
      away_goals,
      winner_team_id,
      status
    } = req.body;

    const updatedMatch = await updateMatch(
      id,
      tournament_id,
      home_team_id,
      away_team_id,
      match_date,
      location,
      round,
      home_goals,
      away_goals,
      winner_team_id,
      status
    );

    if (!updatedMatch) {

      res.status(404).json({
        error: true,
        message: 'Match not found'
      });

      return;
    }

    res.status(200).json({
      message: 'Match updated',
      data: updatedMatch
    });

  } catch (error: any) {

    res.status(500).json({
      error: true,
      message: error.message
    });

  }
};

export const removeMatch = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: true,
        message: 'Invalid match id'
      });
      return;
    }

    const deleted = await deleteMatch(id);

    if (!deleted) {

      res.status(404).json({
        error: true,
        message: 'Match not found'
      });

      return;
    }

    res.status(200).json({
      message: 'Match deleted'
    });

  } catch (error: any) {

    res.status(500).json({
      error: true,
      message: error.message
    });

  }
};