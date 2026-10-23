import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { Auth } from './core/services/auth';
import { Tournament, TournamentBracket, BracketMatch } from './models/tournament';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { MatchList } from './pages/matches/match-list/match-list';
import { TeamList } from './pages/teams/team-list/team-list';
import { TournamentDetail } from './pages/tournaments/tournament-detail/tournament-detail';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';

const tournament: Tournament = { id: 7, name: 'Copa pública', location: 'Firmat',
  rules: 'official_rules_football_5', format: 'knockout', modality: 'futbol_5',
  max_teams: 4, status: 'open', champion_team_id: null, created_at: '2026-01-01T12:00:00Z' };
const team = { id: 1, tournament_id: 7, name: 'Equipo Alfa', players_count: 7, created_at: tournament.created_at };
const champion = { id: 1, name: team.name };
const match: BracketMatch = { id: 20, tournament_id: 7, home_team_id: 1, away_team_id: 2,
  match_date: '2026-01-02T12:00:00Z', location: 'Cancha Central', round: 'semi_final',
  home_goals: 2, away_goals: 1, home_penalties: null, away_penalties: null,
  winner_team_id: null, status: 'live', created_at: tournament.created_at,
  home_team: champion, away_team: { id: 2, name: 'Equipo Beta' }, winner_team: null };
const bracket: TournamentBracket = { tournament: { ...tournament, status: 'in_progress', champion: null },
  rounds: [{ round: 'semi_final', matches: [match] }] };
const user = { id: 1, name: 'User', email: 'user@example.com', role: 'organizer', created_at: tournament.created_at };
const credential = () => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;

describe('Public tournament viewing', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes),
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function publicGet(path: string, data: object): void {
    const request = http.expectOne(path);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(data);
  }

  it('lets visitors navigate from the list to detail without authentication or modification controls', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tournaments', TournamentList);
    publicGet('/api/tournaments', [tournament]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain(tournament.name);
    expect(harness.routeNativeElement?.textContent).not.toMatch(/Crear torneo|Editar|Eliminar/);
    harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a.detail-link')?.click();
    await harness.fixture.whenStable();
    publicGet('/api/tournaments/7', tournament);
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/tournaments/7');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(tournament.name);
    expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toMatch(/Editar torneo|Iniciar torneo/);
    expect(harness.routeNativeElement?.querySelector('a[href="/tournaments/7/teams"]')).toBeTruthy();
    expect(harness.routeNativeElement?.querySelector('a[href="/tournaments/7/matches"]')).toBeTruthy();
    http.expectNone('/api/auth/me');
  });

  it('shows the champion name in public tournament detail', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tournaments/7', TournamentDetail);
    publicGet('/api/tournaments/7', { ...tournament, status: 'finished', champion_team_id: 1 });
    publicGet('/api/teams/1', { data: team });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Campeón');
    expect(harness.routeNativeElement?.textContent).toContain(team.name);
    expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
  });

  it('shows only the tournament teams and no create, edit or delete controls', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/tournaments/7/teams', TeamList);
    publicGet('/api/tournaments/7', tournament);
    publicGet('/api/teams', { data: [team, { ...team, id: 99, tournament_id: 8, name: 'Equipo ajeno' }] });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain(team.name);
    expect(harness.routeNativeElement?.textContent).not.toContain('Equipo ajeno');
    expect(harness.routeNativeElement?.textContent).not.toMatch(/Agregar equipo|Editar|Eliminar/);
    expect(harness.routeNativeElement?.querySelector('button')).toBeNull();
    component['deleteTeam'](team);
    http.expectNone(request => request.method !== 'GET');
  });

  for (const route of ['matches', 'bracket']) {
    it(`shows public results and selectable bracket at /tournaments/:id/${route}`, async () => {
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl(`/tournaments/7/${route}`, MatchList);
      publicGet('/api/tournaments/7/bracket', bracket);
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent).toContain('2 - 1');
      expect(harness.routeNativeElement?.textContent).toContain('Equipo Beta');
      expect(harness.routeNativeElement?.textContent).not.toMatch(/Cargar resultado|Editar resultado|Guardar resultado|Generar siguiente ronda/);
      expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
      harness.routeNativeElement?.querySelector<HTMLButtonElement>('.match-card')?.click();
      harness.detectChanges();
      expect(harness.routeNativeElement?.querySelector('.selected-match')?.textContent).toContain('Equipo Alfa vs. Equipo Beta');
      component['openResultForm'](match);
      component['saveResult']();
      http.expectNone(request => request.method !== 'GET');
    });
  }

  it('keeps next-round generation hidden when the public round has finished', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/tournaments/7/bracket', MatchList);
    publicGet('/api/tournaments/7/bracket', { ...bracket, rounds: [{ round: 'semi_final',
      matches: [{ ...match, status: 'finished', winner_team_id: 1, winner_team: champion }] }] });
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.next-round-panel')).toBeNull();
    component['generateNextRound']();
    http.expectNone(request => request.method !== 'GET');
  });

  it('shows the stored champion and final result in the public bracket', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tournaments/7/bracket', MatchList);
    publicGet('/api/tournaments/7/bracket', {
      tournament: { ...tournament, status: 'finished', champion_team_id: 1, champion },
      rounds: [{ round: 'final', matches: [{ ...match, round: 'final', status: 'finished',
        winner_team_id: 1, winner_team: champion }] }],
    });
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.champion')?.textContent).toContain(team.name);
    expect(harness.routeNativeElement?.textContent).toContain('2 - 1');
    expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
  });

  it('blocks direct navigation to every modification route and keeps login/register public', async () => {
    const harness = await RouterTestingHarness.create();
    for (const route of ['/tournaments/new', '/tournaments/7/edit',
      '/tournaments/7/teams/new', '/tournaments/7/teams/1/edit']) {
      await harness.navigateByUrl(route, Login);
      expect(TestBed.inject(Router).url).toBe('/login');
    }
    await harness.navigateByUrl('/login', Login);
    await harness.navigateByUrl('/register', Register);
    http.expectNone(() => true);
  });

  it('prevents visitor mutation handlers even if called directly', async () => {
    const harness = await RouterTestingHarness.create();
    const list = await harness.navigateByUrl('/tournaments', TournamentList);
    publicGet('/api/tournaments', [tournament]);
    list['deleteTournament'](tournament);
    const detail = await harness.navigateByUrl('/tournaments/7', TournamentDetail);
    publicGet('/api/tournaments/7', tournament);
    detail.matchDate.setValue('2099-01-01T12:00');
    detail['startTournament']();
    http.expectNone(request => request.method !== 'GET');
  });

  it.each([true, false])('restores a stored session on public pages; server accepts session: %s', async accepted => {
    sessionStorage.setItem('tournament.accessToken', credential());
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const me = http.expectOne('/api/auth/me');
    await TestBed.inject(Router).navigateByUrl('/tournaments');
    fixture.detectChanges();
    http.expectOne('/api/tournaments').flush([tournament]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('a[href="/tournaments/new"]')).toBeNull();
    if (accepted) me.flush({ data: user });
    else me.flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/tournaments');
    expect(Boolean(element.querySelector('a[href="/tournaments/new"]'))).toBe(accepted);
    expect(Boolean(element.querySelector('a[href="/tournaments/7/edit"]'))).toBe(accepted);
    expect(element.textContent?.includes('Cerrar sesión')).toBe(accepted);
    expect(Boolean(element.querySelector('a[href="/login"]'))).toBe(!accepted);
    expect(Boolean(element.querySelector('a[href="/register"]'))).toBe(!accepted);
    expect(element.querySelector('a[href="/tournaments"]')).toBeTruthy();
    if (!accepted) expect(TestBed.inject(Auth).token()).toBeNull();
  });
});
