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

  it('deletes the correct id and receives the backend message', () => {
    const received = vi.fn();
    service.delete(7).subscribe(received);
    const request = http.expectOne('/api/tournaments/7');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush({ message: 'Tournament deleted successfully' });
    expect(received).toHaveBeenCalledWith({ message: 'Tournament deleted successfully' });
  });

  it('propagates deletion HTTP errors', () => {
    const failed = vi.fn();
    service.delete(7).subscribe({ error: failed });
    http.expectOne('/api/tournaments/7').flush({ error: true, message: 'Tournament not found' }, { status: 404, statusText: 'Not Found' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });

  const tournament: Tournament = { organizer_id: 1, id: 5, name: 'Copa', location: 'Firmat', modality: 'futbol_5', max_teams: 4, rules: 'official_rules_football_5', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };

  it('starts the correct tournament with POST and returns the nested updated tournament', () => {
    const received = vi.fn();
    const payload = { match_date: '2030-01-02 12:00' };
    service.start(5, payload).subscribe(received);
    const request = http.expectOne('/api/tournaments/5/start');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    const updated = { ...tournament, status: 'in_progress' };
    request.flush({ message: 'Tournament started successfully', data: { tournament: updated, matches: [] } }, { status: 201, statusText: 'Created' });
    expect(received).toHaveBeenCalledExactlyOnceWith(updated);
    http.expectNone('/api/tournaments/5');
  });

  it.each([400, 404, 409, 500])('propagates start HTTP error %s without retrying POST', status => {
    const failed = vi.fn();
    service.start(5, { match_date: '2030-01-02 12:00' }).subscribe({ error: failed });
    http.expectOne('/api/tournaments/5/start').flush({ message: 'Error' }, { status, statusText: 'Error' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
    expect(failed.mock.calls[0][0].status).toBe(status);
    http.expectNone('/api/tournaments/5/start');
  });

  it('propagates a lost start response without retrying', () => {
    const failed = vi.fn();
    service.start(5, { match_date: '2030-01-02 12:00' }).subscribe({ error: failed });
    http.expectOne('/api/tournaments/5/start').error(new ProgressEvent('error'));
    expect(failed.mock.calls[0][0].status).toBe(0);
    http.expectNone('/api/tournaments/5/start');
  });

  it('gets an individual tournament from the correct endpoint', () => {
    let received: Tournament | undefined;
    service.getById(5).subscribe((value) => { received = value; });
    const request = http.expectOne('/api/tournaments/5');
    expect(request.request.method).toBe('GET');
    request.flush(tournament);
    expect(received).toEqual(tournament);
  });

  it('gets the bracket contract directly from the existing endpoint', () => {
    const received = vi.fn();
    const bracket = {
      tournament: { ...tournament, champion: null },
      rounds: [{ round: 'semi_final' as const, matches: [] }],
    };
    service.getBracket(5).subscribe(received);
    const request = http.expectOne('/api/tournaments/5/bracket');
    expect(request.request.method).toBe('GET');
    request.flush(bracket);
    expect(received).toHaveBeenCalledExactlyOnceWith(bracket);
  });

  it('propagates bracket HTTP errors', () => {
    const failed = vi.fn();
    service.getBracket(5).subscribe({ error: failed });
    http.expectOne('/api/tournaments/5/bracket').flush({}, { status: 500, statusText: 'Server Error' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });

  it('generates the next round with POST and returns the nested backend result', () => {
    const received = vi.fn();
    const payload = { match_date: '2030-01-08 18:30' };
    const result = { current_round: 'quarter_final' as const, next_round: 'semi_final' as const, matches: [] };
    service.generateNextRound(5, payload).subscribe(received);
    const request = http.expectOne('/api/tournaments/5/next-round');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ message: 'Next round generated successfully', data: result }, { status: 201, statusText: 'Created' });
    expect(received).toHaveBeenCalledExactlyOnceWith(result);
  });

  it.each([400, 404, 409, 500])('propagates next-round HTTP error %s without retrying POST', status => {
    const failed = vi.fn();
    service.generateNextRound(5, { match_date: '2030-01-08 18:30' }).subscribe({ error: failed });
    http.expectOne('/api/tournaments/5/next-round').flush({ message: 'Error' }, { status, statusText: 'Error' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
    expect(failed.mock.calls[0][0].status).toBe(status);
    http.expectNone('/api/tournaments/5/next-round');
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
    const created: Tournament = { ...payload, organizer_id: 1, id: 8, status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };
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
