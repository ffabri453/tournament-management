import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { CreateTournamentRequest, GenerateNextRoundRequest, GenerateNextRoundResponse, GenerateNextRoundResult, StartTournamentRequest, StartTournamentResponse, Tournament, TournamentBracket, UpdateTournamentRequest } from '../../models/tournament';

@Injectable({
  providedIn: 'root',
})
export class TournamentService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<Tournament[]> {
    return this.http.get<Tournament[]>('/api/tournaments');
  }

  create(payload: CreateTournamentRequest): Observable<Tournament> {
    return this.http.post<Tournament>('/api/tournaments', payload);
  }

  getById(id: number): Observable<Tournament> {
    return this.http.get<Tournament>(`/api/tournaments/${id}`);
  }

  getBracket(id: number): Observable<TournamentBracket> {
    return this.http.get<TournamentBracket>(`/api/tournaments/${id}/bracket`);
  }

  generateNextRound(id: number, payload: GenerateNextRoundRequest): Observable<GenerateNextRoundResult> {
    return this.http.post<GenerateNextRoundResponse>(`/api/tournaments/${id}/next-round`, payload).pipe(
      map(response => response.data),
    );
  }

  update(id: number, payload: UpdateTournamentRequest): Observable<Tournament> {
    return this.http.put<Tournament>(`/api/tournaments/${id}`, payload);
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/tournaments/${id}`);
  }

  start(id: number, payload: StartTournamentRequest): Observable<Tournament> {
    return this.http.post<StartTournamentResponse>(`/api/tournaments/${id}/start`, payload).pipe(
      map(response => response.data.tournament),
    );
  }
}
