import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Match } from '../../models/match';
import { MatchService } from './match';

describe('MatchService', () => {
  let service: MatchService;
  let http: HttpTestingController;
  const match: Match = {
    id: 1,
    tournament_id: 7,
    home_team_id: 10,
    away_team_id: 11,
    match_date: '2026-10-20T18:00:00.000Z',
    location: 'Cancha 1',
    round: 'quarter_final',
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    winner_team_id: null,
    status: 'scheduled',
    created_at: '2026-10-19T12:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MatchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('is created', () => expect(service).toBeTruthy());

  it('uses GET /api/matches and returns only matches from the selected tournament', () => {
    const received = vi.fn();
    service.getByTournamentId(7).subscribe(received);
    const request = http.expectOne('/api/matches');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    const data = [match, { ...match, id: 2, tournament_id: 8 }, { ...match, id: 3 }];
    request.flush({ message: 'List of matches', data });
    expect(received).toHaveBeenCalledExactlyOnceWith([data[0], data[2]]);
  });

  it('returns an empty list when the tournament has no matches', () => {
    const received = vi.fn();
    service.getByTournamentId(9).subscribe(received);
    http.expectOne('/api/matches').flush({ message: 'List of matches', data: [match] });
    expect(received).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('propagates listing failures to the component', () => {
    const failed = vi.fn();
    service.getByTournamentId(7).subscribe({ error: failed });
    http.expectOne('/api/matches').error(new ProgressEvent('error'));
    expect(failed.mock.calls[0][0].status).toBe(0);
  });

  it('updates a match with the complete backend body and unwraps the response', () => {
    const received = vi.fn();
    const payload = {
      tournament_id: match.tournament_id,
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      match_date: match.match_date,
      location: match.location,
      round: match.round,
      home_goals: 3,
      away_goals: 2,
      home_penalties: null,
      away_penalties: null,
      status: 'finished' as const,
    };
    service.update(match.id, payload).subscribe(received);
    const request = http.expectOne('/api/matches/1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body).not.toHaveProperty('winner_team_id');
    const updated = { ...match, ...payload, winner_team_id: match.home_team_id };
    request.flush({ message: 'Match updated', data: updated });
    expect(received).toHaveBeenCalledExactlyOnceWith(updated);
  });

  it.each([400, 404, 409, 500])('propagates update error %s without retrying PUT', status => {
    const failed = vi.fn();
    service.update(match.id, {
      tournament_id: match.tournament_id,
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      match_date: match.match_date,
      location: match.location,
      round: match.round,
      home_goals: 1,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      status: 'finished',
    }).subscribe({ error: failed });
    http.expectOne('/api/matches/1').flush({ message: 'Error' }, { status, statusText: 'Error' });
    expect(failed.mock.calls[0][0].status).toBe(status);
    http.expectNone('/api/matches/1');
  });
});
