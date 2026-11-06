import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Match, UpdateMatchRequest } from '../../models/match';

interface MatchResponse<T> {
  message: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class MatchService {
  private readonly http = inject(HttpClient);

  getByTournamentId(tournamentId: number): Observable<Match[]> {
    // The current API lists every match, so tournament scoping is done client-side.
    return this.http.get<MatchResponse<Match[]>>('/api/matches').pipe(
      map(response => response.data.filter(match => match.tournament_id === tournamentId)),
    );
  }

  update(id: number, payload: UpdateMatchRequest): Observable<Match> {
    return this.http.put<MatchResponse<Match>>(`/api/matches/${id}`, payload).pipe(
      map(response => response.data),
    );
  }
}
