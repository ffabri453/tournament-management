import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { CreateTeamRequest, Team, UpdateTeamRequest } from '../../models/team';

interface TeamResponse<T> {
  message: string;
  data: T;
}

export interface TeamLogoMutation {
  message: string;
  data: { team_id: number; has_logo: boolean };
}

@Injectable({
  providedIn: 'root',
})
export class TeamService {
  private readonly http = inject(HttpClient);

  getByTournamentId(tournamentId: number): Observable<Team[]> {
    // La API actual devuelve todos los equipos; el filtro se aplica en el cliente.
    return this.http.get<TeamResponse<Team[]>>('/api/teams').pipe(
      map(response => response.data.filter(team => team.tournament_id === tournamentId)),
    );
  }

  create(payload: CreateTeamRequest): Observable<Team> {
    return this.http.post<TeamResponse<Team>>('/api/teams', payload).pipe(
      map(response => response.data),
    );
  }

  getById(id: number): Observable<Team> {
    return this.http.get<TeamResponse<Team>>(`/api/teams/${id}`).pipe(
      map(response => response.data),
    );
  }

  update(id: number, payload: UpdateTeamRequest): Observable<Team> {
    return this.http.put<TeamResponse<Team>>(`/api/teams/${id}`, payload).pipe(
      map(response => response.data),
    );
  }

  uploadLogo(id: number, file: File): Observable<TeamLogoMutation> {
    return this.http.put<TeamLogoMutation>(`/api/teams/${id}/logo`, file, {
      headers: { 'Content-Type': file.type },
    });
  }

  deleteLogo(id: number): Observable<TeamLogoMutation> {
    return this.http.delete<TeamLogoMutation>(`/api/teams/${id}/logo`);
  }

  logoUrl(id: number): string {
    return `/api/teams/${id}/logo`;
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/teams/${id}`);
  }
}
