import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { Team } from '../../models/team';
import { TeamService } from './team';

describe('TeamService', () => {
  let service: TeamService;
  let http: HttpTestingController;
  const team: Team = { id: 1, tournament_id: 7, name: 'Equipo Alfa', players_count: 7, has_logo: false, created_at: '2026-10-09T12:00:00.000Z' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TeamService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('should be created', () => expect(service).toBeTruthy());

  it('uses the real endpoint and returns only teams belonging to the requested tournament', () => {
    const received = vi.fn();
    service.getByTournamentId(7).subscribe(received);
    const request = http.expectOne('/api/teams');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    const data = [team, { ...team, id: 2, tournament_id: 70 }, { ...team, id: 3, tournament_id: 7 }];
    request.flush({ message: 'Teams retrieved successfully', data });
    expect(received).toHaveBeenCalledExactlyOnceWith([data[0], data[2]]);
    expect(data).toHaveLength(3);
  });

  it('returns an empty list when all teams belong to another tournament', () => {
    const received = vi.fn();
    service.getByTournamentId(8).subscribe(received);
    http.expectOne('/api/teams').flush({ message: 'OK', data: [team] });
    expect(received).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('does not reuse a stale list across tournaments or refreshes', () => {
    const received = vi.fn();
    service.getByTournamentId(7).subscribe();
    http.expectOne('/api/teams').flush({ data: [team] });
    service.getByTournamentId(8).subscribe(received);
    const other = { ...team, id: 2, tournament_id: 8 };
    http.expectOne('/api/teams').flush({ data: [team, other] });
    expect(received).toHaveBeenCalledExactlyOnceWith([other]);
  });

  it('posts the exact creation body and unwraps data', () => {
    const payload = { tournament_id: 7, name: 'Equipo Alfa', players_count: 7 };
    const received = vi.fn();
    service.create(payload).subscribe(received);
    const request = http.expectOne('/api/teams');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ message: 'Team created successfully', data: team }, { status: 201, statusText: 'Created' });
    expect(received).toHaveBeenCalledExactlyOnceWith(team);
  });

  it.each([400, 404, 409, 500])('propagates creation error %s to the component', status => {
    const failed = vi.fn();
    service.create({ tournament_id: 7, name: 'Equipo Alfa', players_count: 7 }).subscribe({ error: failed });
    http.expectOne('/api/teams').flush({ message: 'Error' }, { status, statusText: 'Error' });
    expect(failed.mock.calls[0][0].status).toBe(status);
  });

  it('propagates a listing failure instead of presenting an empty list', () => {
    const failed = vi.fn();
    service.getByTournamentId(7).subscribe({ error: failed });
    http.expectOne('/api/teams').error(new ProgressEvent('error'));
    expect(failed.mock.calls[0][0].status).toBe(0);
  });

  it('fetches one team by ID and unwraps the response', () => {
    const received = vi.fn();
    service.getById(1).subscribe(received);
    const request = http.expectOne('/api/teams/1');
    expect(request.request.method).toBe('GET');
    request.flush({ message: 'OK', data: team });
    expect(received).toHaveBeenCalledExactlyOnceWith(team);
  });

  it('sends all required fields with PUT and returns the updated team', () => {
    const received = vi.fn();
    const payload = { tournament_id: 7, name: 'Equipo Beta', players_count: 8 };
    service.update(1, payload).subscribe(received);
    const request = http.expectOne('/api/teams/1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    request.flush({ message: 'OK', data: { ...team, ...payload } });
    expect(received).toHaveBeenCalledExactlyOnceWith({ ...team, ...payload });
  });

  it('uploads a logo as its original binary MIME type', () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'escudo.png', { type: 'image/png' });
    const received = vi.fn();
    service.uploadLogo(1, file).subscribe(received);
    const request = http.expectOne('/api/teams/1/logo');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('image/png');
    const response = { message: 'Team logo updated successfully', data: { team_id: 1, has_logo: true } };
    request.flush(response);
    expect(received).toHaveBeenCalledExactlyOnceWith(response);
  });

  it('deletes a logo and exposes its stable URL', () => {
    const received = vi.fn();
    service.deleteLogo(1).subscribe(received);
    const request = http.expectOne('/api/teams/1/logo');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush({ message: 'Team logo removed successfully', data: { team_id: 1, has_logo: false } });
    expect(received).toHaveBeenCalledOnce();
    expect(service.logoUrl(1)).toBe('/api/teams/1/logo');
  });

  it('deletes by ID without a body and preserves the confirmation response', () => {
    const received = vi.fn();
    service.delete(1).subscribe(received);
    const request = http.expectOne('/api/teams/1');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush({ message: 'Team deleted successfully' });
    expect(received).toHaveBeenCalledExactlyOnceWith({ message: 'Team deleted successfully' });
  });

  it.each([400, 404, 409, 500])('propagates update and delete failures %s', status => {
    const requests: Observable<unknown>[] = [service.update(1, team), service.delete(1)];
    for (const request$ of requests) {
      const failed = vi.fn();
      request$.subscribe({ error: failed });
      http.expectOne('/api/teams/1').flush({ message: 'Error' }, { status, statusText: 'Error' });
      expect(failed.mock.calls[0][0].status).toBe(status);
    }
  });
});
