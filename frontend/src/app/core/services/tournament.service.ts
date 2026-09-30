import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Tournament } from '../../models/tournament';

@Injectable({
  providedIn: 'root',
})
export class TournamentService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<Tournament[]> {
    return this.http.get<Tournament[]>('/api/tournaments');
  }
}
