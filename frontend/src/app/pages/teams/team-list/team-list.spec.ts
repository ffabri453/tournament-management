import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TeamService } from '../../../core/services/team';
import { Team } from '../../../models/team';
import { Tournament } from '../../../models/tournament';
import { TeamList } from './team-list';
import { Auth } from '../../../core/services/auth';

describe('TeamList', () => {
  let fixture: ComponentFixture<TeamList>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const tournament: Tournament = { organizer_id: 1, id: 7, name: 'Copa Regional', location: 'Firmat', modality: 'futbol_7', max_teams: 4, rules: 'official_rules_football_7', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-09T12:00:00.000Z' };
  const team: Team = { id: 1, tournament_id: 7, name: 'Equipo Alfa', players_count: 7, has_logo: false, created_at: tournament.created_at };
  const load = (current = tournament, teams: Team[] = [team]) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(current);
    http.expectOne('/api/teams').flush({ message: 'OK', data: teams });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    let logoId = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true, writable: true, value: vi.fn(() => `blob:team-crest-${++logoId}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true, writable: true, value: vi.fn(),
    });
    params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    await TestBed.configureTestingModule({ imports: [TeamList], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: Auth, useValue: { user: () => ({ id: 1, role: 'organizer' }) } },
      { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeamList);
    element = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => { fixture.destroy(); http.verify(); vi.restoreAllMocks(); });

  describe('team crests', () => {
    it('loads only the current tournament crests and keeps a shirt icon for teams without one', () => {
      load(tournament, [
        { ...team, has_logo: true },
        { ...team, id: 2, name: 'Equipo Beta', has_logo: true },
        { ...team, id: 3, name: 'Equipo Gamma' },
        { ...team, id: 4, tournament_id: 8, name: 'Equipo ajeno', has_logo: true },
      ]);
      const first = http.expectOne('/api/teams/1/logo');
      expect(first.request.method).toBe('GET');
      expect(first.request.responseType).toBe('blob');
      first.flush(new Blob(['first crest'], { type: 'image/png' }));
      http.expectOne('/api/teams/2/logo').flush(new Blob(['second crest'], { type: 'image/webp' }));
      http.expectNone('/api/teams/3/logo');
      http.expectNone('/api/teams/4/logo');
      fixture.detectChanges();
      const cards = element.querySelectorAll('.team-card');
      expect(cards).toHaveLength(3);
      expect(cards[0].querySelector<HTMLImageElement>('.team-crest')?.alt).toBe('Escudo de Equipo Alfa');
      expect(cards[0].querySelector('.team-crest')?.getAttribute('src')).toBe('blob:team-crest-1');
      expect(cards[1].querySelector('.team-crest')?.getAttribute('src')).toBe('blob:team-crest-2');
      expect(cards[0].querySelector('.team-icon')).toBeNull();
      expect(cards[2].querySelector('.team-icon svg')).not.toBeNull();
      expect(cards[2].querySelector('.team-crest')).toBeNull();
    });

    it.each([404, 500])('retains the team and shirt icon when its crest request fails with %s', status => {
      load(tournament, [{ ...team, has_logo: true }]);
      http.expectOne('/api/teams/1/logo').flush(null, { status, statusText: 'Error' });
      fixture.detectChanges();
      expect(element.querySelector('.team-icon svg')).not.toBeNull();
      expect(element.querySelector('.team-crest')).toBeNull();
      expect(element.textContent).toContain(team.name);
      expect(element.querySelector('[role="alert"]')).toBeNull();
    });

    it('falls back to the shirt and releases an image the browser cannot display', () => {
      load(tournament, [{ ...team, has_logo: true }]);
      http.expectOne('/api/teams/1/logo').flush(new Blob(['invalid image'], { type: 'image/png' }));
      fixture.detectChanges();
      element.querySelector('.team-crest')?.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:team-crest-1');
      expect(element.querySelector('.team-crest')).toBeNull();
      expect(element.querySelector('.team-icon svg')).not.toBeNull();
    });

    it.each(['navigation', 'destruction'])('cancels pending crest requests on %s', action => {
      load(tournament, [{ ...team, has_logo: true }]);
      const request = http.expectOne('/api/teams/1/logo');
      if (action === 'navigation') {
        params.next(convertToParamMap({ id: '8' }));
        http.expectOne('/api/tournaments/8').flush({ ...tournament, id: 8 });
        http.expectOne('/api/teams').flush({ data: [] });
      } else {
        fixture.destroy();
      }
      expect(request.cancelled).toBe(true);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('releases loaded crests and updates the card after a logo is removed', () => {
      load(tournament, [{ ...team, has_logo: true }]);
      http.expectOne('/api/teams/1/logo').flush(new Blob(['crest'], { type: 'image/png' }));
      fixture.detectChanges();
      fixture.componentInstance['refreshTeams']();
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:team-crest-1');
      http.expectOne('/api/tournaments/7').flush(tournament);
      http.expectOne('/api/teams').flush({ data: [team] });
      fixture.detectChanges();
      expect(element.querySelector('.team-crest')).toBeNull();
      expect(element.querySelector('.team-icon svg')).not.toBeNull();
      http.expectNone('/api/teams/1/logo');
    });

    it('releases loaded crests when leaving the list', () => {
      load(tournament, [{ ...team, has_logo: true }]);
      http.expectOne('/api/teams/1/logo').flush(new Blob(['crest'], { type: 'image/png' }));
      fixture.destroy();
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:team-crest-1');
    });
  });

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
    expect(element.querySelector('h1')?.textContent).toBe('Equipos');
    expect(element.querySelector('.tournament-name')?.textContent).toBe('Copa Regional');
    expect(element.textContent).toContain('1 de 4 equipos');
    expect(element.textContent).toContain('Equipo Alfa');
    expect(element.textContent).not.toContain('Equipo ajeno');
    expect(element.querySelector('.player-count')?.textContent).toBe('7');
  });

  it('shows an empty state even when other tournaments have teams', () => {
    load(tournament, [{ ...team, tournament_id: 8 }]);
    expect(element.textContent).toContain('no hay equipos registrados');
    expect(element.querySelector('.team-grid')).toBeNull();
    expect(element.querySelector('a[href="/tournaments/7/teams/new"]')).not.toBeNull();
  });

  it.each([null, '', 'abc', '0', '-1', '1.5', '1e2', '2147483648'])('rejects invalid ID %s without HTTP', id => {
    params.next(convertToParamMap(id === null ? {} : { id }));
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('identificador');
    expect(element.querySelector('.team-grid')).toBeNull();
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
    expect(element.querySelector('.team-grid')).toBeNull();
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

  it('links to editing by team ID even when all tournament places are occupied', () => {
    load(tournament, Array.from({ length: 4 }, (_, i) => ({ ...team, id: i + 1 })));
    expect(element.querySelector('a[href="/tournaments/7/teams/1/edit"]')?.textContent).toBe('Editar');
    expect(element.querySelector('a[href$="/new"]')).toBeNull();
  });

  it('does not send DELETE if confirmation is cancelled', () => {
    load();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    element.querySelector<HTMLButtonElement>('button.delete')?.click();
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain(team.name);
    http.expectNone(() => true);
    expect(element.textContent).toContain(team.name);
  });

  it('deletes once, waits for success and reloads both tournament and teams', () => {
    load(tournament, Array.from({ length: 4 }, (_, i) => ({ ...team, id: i + 1 })));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const button = element.querySelector<HTMLButtonElement>('button.delete');
    button?.click();
    button?.click();
    fixture.detectChanges();
    expect(Array.from(element.querySelectorAll<HTMLButtonElement>('button.delete')).every(button => button.disabled)).toBe(true);
    expect(element.textContent).toContain('Eliminando...');
    expect(element.querySelectorAll('.team-card')).toHaveLength(4);
    const request = http.expectOne('/api/teams/1');
    expect(request.request.method).toBe('DELETE');
    request.flush({ message: 'Team deleted successfully' });
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams').flush({ data: [{ ...team, id: 2 }] });
    fixture.detectChanges();
    expect(element.querySelectorAll('.team-card')).toHaveLength(1);
    expect(element.textContent).toContain('1 de 4 equipos');
    expect(element.querySelector('a[href$="/new"]')).not.toBeNull();
    expect(element.querySelector<HTMLButtonElement>('button.delete')?.disabled).toBe(false);
  });

  it.each(['in_progress', 'finished'] as const)('allows editing but disables deleting when %s', status => {
    load({ ...tournament, status });
    const confirm = vi.spyOn(window, 'confirm');
    expect(element.querySelector('a[href="/tournaments/7/teams/1/edit"]')).not.toBeNull();
    const button = element.querySelector<HTMLButtonElement>('button.delete');
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(confirm).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });

  it.each([0, 400, 404, 409, 500, 503])('keeps the team on DELETE error %s and offers a real refresh', status => {
    load();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    element.querySelector<HTMLButtonElement>('button.delete')?.click();
    const request = http.expectOne('/api/teams/1');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ message: 'raw database error' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelectorAll('.team-card')).toHaveLength(1);
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).not.toContain('raw database');
    const refresh = Array.from(element.querySelectorAll('button')).find(button => button.textContent === 'Actualizar equipos');
    refresh?.click();
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams').flush({ data: [] });
    fixture.detectChanges();
    expect(element.querySelector('.team-grid')).toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('explains a concurrently started tournament and disables deleting after refreshing', () => {
    load();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    element.querySelector<HTMLButtonElement>('button.delete')?.click();
    http.expectOne('/api/teams/1').flush({ message: 'A team cannot be deleted after its tournament has started' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pueden eliminar equipos');
    Array.from(element.querySelectorAll('button')).find(button => button.textContent === 'Actualizar equipos')?.click();
    http.expectOne('/api/tournaments/7').flush({ ...tournament, status: 'in_progress' });
    http.expectOne('/api/teams').flush({ data: [team] });
    fixture.detectChanges();
    expect(element.querySelector<HTMLButtonElement>('button.delete')?.disabled).toBe(true);
  });

  it('cancels a pending deletion on route change without refreshing the old tournament', () => {
    load();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    element.querySelector<HTMLButtonElement>('button.delete')?.click();
    const request = http.expectOne('/api/teams/1');
    params.next(convertToParamMap({ id: '8' }));
    expect(request.cancelled).toBe(true);
    http.expectOne('/api/tournaments/8').flush({ ...tournament, id: 8 });
    http.expectOne('/api/teams').flush({ data: [{ ...team, id: 2, tournament_id: 8, name: 'Equipo Beta' }] });
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Eliminando');
    expect(element.textContent).toContain('Equipo Beta');
    http.expectNone('/api/tournaments/7');
  });

  it('cancels a pending deletion on destruction', () => {
    load();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    element.querySelector<HTMLButtonElement>('button.delete')?.click();
    const request = http.expectOne('/api/teams/1');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
