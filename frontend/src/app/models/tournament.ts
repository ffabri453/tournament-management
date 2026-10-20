import { Match, MatchRound } from './match';

export interface Tournament {
  id: number;
  name: string;
  location: 'Firmat' | 'Venado Tuerto' | 'Rosario' | 'Elortondo';
  rules: string;
  format: 'knockout';
  modality: 'futbol_5' | 'futbol_7' | 'futbol_11';
  max_teams: 4 | 8 | 16 | 32;
  status: 'open' | 'in_progress' | 'finished';
  champion_team_id: number | null;
  // Las fechas de PostgreSQL llegan como texto en la respuesta JSON.
  created_at: string;
}

export type CreateTournamentRequest = Pick<
  Tournament, 'name' | 'location' | 'modality' | 'max_teams' | 'rules' | 'format'
>;

export type UpdateTournamentRequest = Partial<Omit<CreateTournamentRequest, 'rules'>>;

export interface StartTournamentRequest {
  match_date: string;
}

export interface StartTournamentResponse {
  message: string;
  data: {
    tournament: Tournament;
    matches: Match[];
  };
}

export type GenerateNextRoundRequest = StartTournamentRequest;

export interface GenerateNextRoundResult {
  current_round: MatchRound;
  next_round: MatchRound;
  matches: Match[];
}

export interface GenerateNextRoundResponse {
  message: string;
  data: GenerateNextRoundResult;
}

export interface BracketTeam {
  id: number;
  name: string;
  has_logo: boolean;
}

export interface BracketMatch extends Match {
  home_team: BracketTeam | null;
  away_team: BracketTeam | null;
  winner_team: BracketTeam | null;
}

export interface TournamentBracket {
  tournament: Tournament & { champion: BracketTeam | null };
  rounds: { round: MatchRound; matches: BracketMatch[] }[];
}
