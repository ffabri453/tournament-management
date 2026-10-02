import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateTournamentRequest, Tournament, UpdateTournamentRequest } from '../../models/tournament';

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

  update(id: number, payload: UpdateTournamentRequest): Observable<Tournament> {
    return this.http.put<Tournament>(`/api/tournaments/${id}`, payload);
  }
}
