import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreateTournamentInput, Tournament } from '../../models/tournament';
import { TournamentService } from './tournament.service';

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

  it.each([
    ['futbol_5', 'official_rules_football_5'],
    ['futbol_7', 'official_rules_football_7'],
    ['futbol_11', 'official_rules_football_11'],
  ] as const)('creates a %s knockout tournament with its official rules', (modality, rules) => {
    const input: CreateTournamentInput = {
      name: 'Liga regional',
      location: 'Firmat',
      modality,
      max_teams: 8,
    };
    const created: Tournament = {
      id: 1,
      ...input,
      rules,
      format: 'knockout',
      status: 'open',
      champion_team_id: null,
      created_at: '2026-10-02T12:00:00.000Z',
    };
    const received = vi.fn();

    service.create(input).subscribe(received);

    const request = http.expectOne('/api/tournaments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      ...input,
      format: 'knockout',
      rules,
    });
    request.flush(created);
    expect(received).toHaveBeenCalledWith(created);
  });
});
