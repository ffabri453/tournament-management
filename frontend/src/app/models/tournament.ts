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

export type CreateTournamentInput = Pick<
  Tournament,
  'name' | 'location' | 'modality' | 'max_teams'
>;
