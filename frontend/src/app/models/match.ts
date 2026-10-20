export type MatchRound =
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter_final'
  | 'semi_final'
  | 'final';

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'suspended';

export interface Match {
  id: number;
  tournament_id: number;
  home_team_id: number;
  away_team_id: number;
  // PostgreSQL timestamps are serialized as strings by the API.
  match_date: string;
  location: string;
  round: MatchRound;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: number | null;
  status: MatchStatus;
  created_at: string;
}

// PUT /matches/:id requires the complete editable match body. The winner is
// deliberately omitted because the backend derives it from goals and penalties.
export type UpdateMatchRequest = Omit<Match, 'id' | 'winner_team_id' | 'created_at'>;
