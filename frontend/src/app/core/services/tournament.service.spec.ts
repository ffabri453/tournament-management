import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TournamentService } from './tournament.service';
import { CreateTournamentRequest, Tournament } from '../../models/tournament';

describe('TournamentService', () => {
  let service: TournamentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TournamentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const tournament: Tournament = { id: 5, name: 'Copa', location: 'Firmat', modality: 'futbol_5', max_teams: 4, rules: 'official_rules_football_5', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };

  it('gets an individual tournament from the correct endpoint', () => {
    let received: Tournament | undefined;
    service.getById(5).subscribe((value) => { received = value; });
    const request = http.expectOne('/api/tournaments/5');
    expect(request.request.method).toBe('GET');
    request.flush(tournament);
    expect(received).toEqual(tournament);
  });

  it('updates with PUT and returns the tournament directly', () => {
    let received: Tournament | undefined;
    service.update(5, { name: 'Copa actualizada' }).subscribe((value) => { received = value; });
    const request = http.expectOne('/api/tournaments/5');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'Copa actualizada' });
    request.flush({ ...tournament, name: 'Copa actualizada' });
    expect(received).toEqual({ ...tournament, name: 'Copa actualizada' });
  });

  it.each(['getById', 'update'] as const)('propagates errors from %s', (method) => {
    const failed = vi.fn();
    const request = method === 'getById' ? service.getById(5) : service.update(5, { name: 'Copa' });
    request.subscribe({ error: failed });
    http.expectOne('/api/tournaments/5').flush({}, { status: 404, statusText: 'Not Found' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });

  it('posts the creation payload and receives the tournament directly', () => {
    const payload: CreateTournamentRequest = {
      name: 'Copa Regional', location: 'Firmat', modality: 'futbol_5', max_teams: 4,
      rules: 'official_rules_football_5', format: 'knockout',
    };
    const created: Tournament = { ...payload, id: 8, status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };
    let received: Tournament | undefined;
    service.create(payload).subscribe((tournament) => { received = tournament; });
    const request = http.expectOne('/api/tournaments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush(created, { status: 201, statusText: 'Created' });
    expect(received).toEqual(created);
  });

  it('propagates creation errors', () => {
    const failed = vi.fn();
    service.create({ name: 'Copa', location: 'Rosario', modality: 'futbol_11', max_teams: 16, rules: 'official_rules_football_11', format: 'knockout' }).subscribe({ error: failed });
    http.expectOne('/api/tournaments').flush({}, { status: 409, statusText: 'Conflict' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });

  it('gets the array directly from the proxy endpoint', () => {
    const received = vi.fn();
    service.getAll().subscribe(received);
    const request = http.expectOne('/api/tournaments');
    expect(request.request.method).toBe('GET');
    request.flush([]);
    expect(received).toHaveBeenCalledWith([]);
  });

  it('propagates an HTTP error to the component', () => {
    const failed = vi.fn();
    service.getAll().subscribe({ error: failed });
    http.expectOne('/api/tournaments').flush({}, { status: 500, statusText: 'Server error' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });
});
