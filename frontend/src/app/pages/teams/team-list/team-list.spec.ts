import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TeamService } from '../../../core/services/team';
import { Team } from '../../../models/team';
import { Tournament } from '../../../models/tournament';
import { TeamList } from './team-list';

describe('TeamList', () => {
  let fixture: ComponentFixture<TeamList>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const tournament: Tournament = { id: 7, name: 'Copa Regional', location: 'Firmat', modality: 'futbol_7', max_teams: 4, rules: 'official_rules_football_7', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-09T12:00:00.000Z' };
  const team: Team = { id: 1, tournament_id: 7, name: 'Equipo Alfa', players_count: 7, created_at: tournament.created_at };
  const load = (current = tournament, teams: Team[] = [team]) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(current);
    http.expectOne('/api/teams').flush({ message: 'OK', data: teams });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    await TestBed.configureTestingModule({ imports: [TeamList], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeamList);
    element = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it('should create and remain loading until the tournament and teams arrive', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(element.textContent).toContain('Cargando equipos');
    http.expectOne('/api/tournaments/7').flush(tournament);
    fixture.detectChanges();
    expect(element.textContent).toContain('Cargando equipos');
    http.expectOne('/api/teams').flush({ data: [team] });
    fixture.detectChanges();
    expect(element.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
  });

  it('uses the route ID and displays only its real team names and player counts', () => {
    const method = vi.spyOn(TestBed.inject(TeamService), 'getByTournamentId');
    load(tournament, [team, { ...team, id: 2, tournament_id: 8, name: 'Equipo ajeno' }]);
    expect(method).toHaveBeenCalledExactlyOnceWith(7);
    expect(element.textContent).toContain('Equipos de Copa Regional');
    expect(element.textContent).toContain('1 de 4 equipos');
    expect(element.textContent).toContain('Equipo Alfa');
    expect(element.textContent).not.toContain('Equipo ajeno');
    expect(element.querySelector('td')?.textContent).toBe('7');
  });

  it('shows an empty state even when other tournaments have teams', () => {
    load(tournament, [{ ...team, tournament_id: 8 }]);
    expect(element.textContent).toContain('no hay equipos registrados');
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('a[href="/tournaments/7/teams/new"]')).not.toBeNull();
  });

  it.each([null, '', 'abc', '0', '-1', '1.5', '1e2', '2147483648'])('rejects invalid ID %s without HTTP', id => {
    params.next(convertToParamMap(id === null ? {} : { id }));
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('identificador');
    expect(element.querySelector('table')).toBeNull();
  });

  it('handles a missing tournament without requesting teams', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    http.expectNone('/api/teams');
    expect(element.textContent).toContain('No se encontr\u00f3 el torneo');
    expect(element.querySelector('button')).toBeNull();
  });

  it.each([0, 500, 503])('shows a safe teams error %s and retries both reads', status => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(tournament);
    const request = http.expectOne('/api/teams');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ message: 'raw database error' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).not.toContain('raw database');
    expect(element.textContent).not.toContain('no hay equipos');
    const retry = element.querySelector('button');
    retry?.click();
    retry?.click();
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams').flush({ data: [team] });
    fixture.detectChanges();
    expect(element.textContent).toContain(team.name);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it.each(['in_progress', 'finished'] as const)('disallows adding to a %s tournament but shows its teams', status => {
    load({ ...tournament, status });
    expect(element.querySelector('a[href$="/new"]')).toBeNull();
    expect(element.textContent).toContain('No se pueden agregar equipos');
    expect(element.textContent).toContain(team.name);
  });

  it('disallows adding to a full tournament', () => {
    load(tournament, Array.from({ length: 4 }, (_, i) => ({ ...team, id: i + 1 })));
    expect(element.querySelector('a[href$="/new"]')).toBeNull();
    expect(element.textContent).toContain('capacidad m\u00e1xima');
  });

  it.each([['Volver al torneo', '/tournaments/7'], ['Agregar equipo', '/tournaments/7/teams/new']])('navigates with %s', async (label, target) => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = Array.from(element.querySelectorAll('a')).find(link => link.textContent === label);
    expect(link?.getAttribute('href')).toBe(target);
    link?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0][0].toString()).toBe(target);
  });

  it('cancels stale team requests and filters again on a route change', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(tournament);
    const old = http.expectOne('/api/teams');
    params.next(convertToParamMap({ id: '8' }));
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/tournaments/8').flush({ ...tournament, id: 8, name: 'Otra copa' });
    http.expectOne('/api/teams').flush({ data: [team, { ...team, id: 2, tournament_id: 8, name: 'Equipo Beta' }] });
    fixture.detectChanges();
    expect(element.textContent).toContain('Equipo Beta');
    expect(element.textContent).not.toContain('Equipo Alfa');
  });

  it('clears data when a new ID is invalid', () => {
    load();
    params.next(convertToParamMap({ id: 'invalid' }));
    fixture.detectChanges();
    expect(element.querySelector('table')).toBeNull();
    expect(element.textContent).not.toContain(team.name);
    http.expectNone(() => true);
  });

  it('cancels pending reads on destruction', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(tournament);
    const request = http.expectOne('/api/teams');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
