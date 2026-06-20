import { Request, Response } from 'express';
import { getAllTournaments } from '../models/Tournament';

export const getTournaments = async (req: Request, res: Response): Promise<void> => {
  try {
    const tournaments = await getAllTournaments();

    res.status(200).json({
      message: 'List of tournaments',
      data: tournaments
    });
  } catch (error: any) {
    res.status(500).json({
      error: true,
      message: 'Error getting tournaments',
      detail: error.message
    });
  }
};