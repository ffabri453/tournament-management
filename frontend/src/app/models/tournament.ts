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
    matches: {
      id: number;
      tournament_id: number;
      home_team_id: number;
      away_team_id: number;
      match_date: string;
      location: string;
      round: 'round_of_32' | 'round_of_16' | 'quarter_final' | 'semi_final' | 'final';
      home_goals: number | null;
      away_goals: number | null;
      home_penalties: number | null;
      away_penalties: number | null;
      winner_team_id: number | null;
      status: 'scheduled' | 'live' | 'finished' | 'suspended';
      created_at: string;
    }[];
  };
}
