import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateTournamentInput, Tournament } from '../../models/tournament';

const rulesByModality: Record<Tournament['modality'], string> = {
  futbol_5: 'official_rules_football_5',
  futbol_7: 'official_rules_football_7',
  futbol_11: 'official_rules_football_11',
};

@Injectable({
  providedIn: 'root',
})
export class TournamentService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<Tournament[]> {
    return this.http.get<Tournament[]>('/api/tournaments');
  }

  create(tournament: CreateTournamentInput): Observable<Tournament> {
    return this.http.post<Tournament>('/api/tournaments', {
      ...tournament,
      format: 'knockout',
      rules: rulesByModality[tournament.modality],
    });
  }
}
