export interface Team {
  id: number;
  tournament_id: number;
  name: string;
  players_count: number;
  created_at: string;
}

export type CreateTeamRequest = Pick<Team, 'tournament_id' | 'name' | 'players_count'>;
