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
