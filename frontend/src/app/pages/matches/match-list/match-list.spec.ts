import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { BracketMatch, Tournament, TournamentBracket } from '../../../models/tournament';
import { MatchList } from './match-list';
import { Auth } from '../../../core/services/auth';

describe('MatchList unified screen', () => {
  let fixture: ComponentFixture<MatchList>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const tournament: Tournament = { organizer_id: 1,
    id: 7,
    name: 'Copa Regional',
    location: 'Firmat',
    modality: 'futbol_7',
    max_teams: 4,
    rules: 'official_rules_football_7',
    format: 'knockout',
    status: 'in_progress',
    champion_team_id: null,
    created_at: '2026-10-19T12:00:00.000Z',
  };

  const match: BracketMatch = {
    id: 20,
    tournament_id: 7,
    home_team_id: 10,
    away_team_id: 11,
    match_date: '2026-10-20T18:30:00.000Z',
    location: 'Cancha Central',
    round: 'semi_final',
    home_goals: 1,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    winner_team_id: null,
    status: 'live',
    created_at: tournament.created_at,
    home_team: { id: 10, name: 'Club Deportivo Los Halcones del Norte', has_logo: false },
    away_team: { id: 11, name: 'Asociación Deportiva del Sur', has_logo: false },
    winner_team: null,
  };

  const otherMatch: BracketMatch = {
    ...match,
    id: 21,
    home_team_id: 12,
    away_team_id: 13,
    home_goals: null,
    away_goals: null,
    status: 'scheduled',
    home_team: { id: 12, name: 'Club Atlético Central de la Región', has_logo: false },
    away_team: { id: 13, name: 'Sociedad Deportiva Unión del Oeste', has_logo: false },
  };

  const bracket = (matches: BracketMatch[] = [match, otherMatch]): TournamentBracket => ({
    tournament: { ...tournament, champion: null },
    rounds: matches.length === 0 ? [] : [{ round: 'semi_final', matches }],
  });

  const readyForNextRound = (): TournamentBracket => {
    const first = { ...match, status: 'finished' as const, winner_team_id: match.home_team_id,
      winner_team: match.home_team };
    const second = { ...otherMatch, status: 'finished' as const, home_goals: 0, away_goals: 2,
      winner_team_id: otherMatch.away_team_id, winner_team: otherMatch.away_team };
    return bracket([first, second]);
  };

  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T12:00:00Z'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    await TestBed.configureTestingModule({
      imports: [MatchList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth, useValue: { user: () => ({ id: 1, role: 'organizer' }) } },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MatchList);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const load = (value = bracket()) => {
    fixture.detectChanges();
    const request = http.expectOne('/api/tournaments/7/bracket');
    expect(request.request.method).toBe('GET');
    request.flush(value);
    fixture.detectChanges();
  };

  const openResultForm = (value = bracket()) => {
    load(value);
    element.querySelector<HTMLButtonElement>('.actions button')?.click();
    fixture.detectChanges();
  };

  const submitResult = () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  it('loads bracket and matches from one endpoint with an accessible loading state', () => {
    fixture.detectChanges();
    expect(element.textContent).toContain('Cargando partidos y cuadro...');
    expect(element.querySelector('.screen-state')?.getAttribute('aria-busy')).toBe('true');
    http.expectOne('/api/tournaments/7/bracket').flush(bracket());
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe('Partidos y cuadro de Copa Regional');
    expect(element.querySelector('.screen-state')?.getAttribute('aria-busy')).toBe('false');
    http.expectNone('/api/tournaments/7');
    http.expectNone('/api/matches');
    http.expectNone('/api/teams');
  });

  it('shows the connected bracket above the detailed list with complete names', () => {
    load();
    expect(element.querySelector('.bracket-section app-bracket')).not.toBeNull();
    const bracketSection = element.querySelector('.bracket-section')!;
    const matchesSection = element.querySelector('.matches-section')!;
    expect(Boolean(bracketSection.compareDocumentPosition(matchesSection) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(element.querySelectorAll('app-bracket .match-card')).toHaveLength(3);
    expect(element.querySelectorAll('tbody tr:not(.form-row)')).toHaveLength(2);
    const text = element.textContent ?? '';
    for (const name of [match.home_team!.name, match.away_team!.name, otherMatch.home_team!.name, otherMatch.away_team!.name]) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain('Club Dep.');
    expect(element.querySelectorAll('app-bracket .crest-slot')).toHaveLength(6);
  });

  it('selects a bracket match, highlights both views and shows its details', () => {
    load();
    element.querySelector<HTMLButtonElement>('app-bracket button.match-card')?.click();
    fixture.detectChanges();
    const detail = element.querySelector('.selected-match');
    expect(detail?.textContent).toContain(match.home_team!.name);
    expect(detail?.textContent).toContain(match.away_team!.name);
    expect(detail?.textContent).toContain('Cancha Central');
    expect(detail?.textContent).toContain('Semifinal');
    expect(detail?.textContent).toContain('En juego');
    expect(detail?.textContent).toContain('1 - 0');
    expect(detail?.querySelectorAll('.crest-slot')).toHaveLength(2);
    expect(element.querySelector('app-bracket .match-card.selected')).not.toBeNull();
    expect(element.querySelectorAll('tr.selected-row')).toHaveLength(1);
  });

  it('shows pending future rounds without adding them to the real match list', () => {
    load();
    expect(element.querySelectorAll('app-bracket .pending')).toHaveLength(1);
    expect(element.querySelectorAll('app-bracket .pending .team-name')[0]?.textContent).toBe('Por definir');
    expect(element.querySelectorAll('tbody tr:not(.form-row)')).toHaveLength(2);
    expect(element.querySelector('tbody')?.textContent).not.toContain('Por definir');
  });

  it('offers next-round generation only when every current match has a winner', () => {
    load();
    expect(element.querySelector('.next-round-panel')).toBeNull();

    params.next(convertToParamMap({ id: '8' }));
    const ready = readyForNextRound();
    ready.tournament = { ...ready.tournament, id: 8 };
    http.expectOne('/api/tournaments/8/bracket').flush(ready);
    fixture.detectChanges();

    expect(element.querySelector('.next-round-panel h3')?.textContent).toContain('Generar Final');
    expect(element.querySelector('#next-round-date')?.getAttribute('type')).toBe('datetime-local');
  });

  it('validates the next-round date before requesting the backend', () => {
    load(readyForNextRound());
    fixture.componentInstance.nextRoundForm.setValue({ match_date: '2026-10-31T18:30' });
    element.querySelector('.next-round-panel form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(element.querySelector('.next-round-panel [role="alert"]')?.textContent).toContain('fecha y hora futuras');
    http.expectNone('/api/tournaments/7/next-round');
  });

  it('confirms, prevents duplicate POSTs and refreshes bracket and list after generating', () => {
    const ready = readyForNextRound();
    load(ready);
    fixture.componentInstance.nextRoundForm.setValue({ match_date: '2026-11-02T18:30' });
    const form = element.querySelector('.next-round-panel form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(window.confirm).toHaveBeenCalledExactlyOnceWith('¿Generar Final con fecha 2026-11-02 18:30?');
    const request = http.expectOne('/api/tournaments/7/next-round');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ match_date: '2026-11-02 18:30' });

    const finalMatch: BracketMatch = { ...match, id: 30, round: 'final',
      home_team_id: match.home_team_id, away_team_id: otherMatch.away_team_id,
      home_team: match.home_team, away_team: otherMatch.away_team,
      home_goals: null, away_goals: null, winner_team_id: null, winner_team: null,
      status: 'scheduled', match_date: '2026-11-02T21:30:00.000Z' };
    request.flush({ message: 'Next round generated successfully', data: {
      current_round: 'semi_final', next_round: 'final', matches: [finalMatch],
    } }, { status: 201, statusText: 'Created' });
    const refreshed: TournamentBracket = { ...ready, rounds: [
      ready.rounds[0]!, { round: 'final', matches: [finalMatch] },
    ] };
    http.expectOne('/api/tournaments/7/bracket').flush(refreshed);
    fixture.detectChanges();

    expect(element.querySelectorAll('tbody tr:not(.form-row)')).toHaveLength(3);
    expect(element.querySelector('app-bracket')?.textContent).toContain('Partido #30');
    expect(element.textContent).toContain('Final generada correctamente');
    expect(element.querySelector('.next-round-panel')).toBeNull();
  });

  it('does not generate the next round when confirmation is cancelled', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    load(readyForNextRound());
    fixture.componentInstance.nextRoundForm.setValue({ match_date: '2026-11-02T18:30' });
    element.querySelector('.next-round-panel form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    http.expectNone('/api/tournaments/7/next-round');
  });

  it('shows a backend round conflict and requires a canonical refresh before retrying', () => {
    load(readyForNextRound());
    fixture.componentInstance.nextRoundForm.setValue({ match_date: '2026-11-02T18:30' });
    const form = element.querySelector('.next-round-panel form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne('/api/tournaments/7/next-round').flush({ error: true,
      message: 'Every match in semi_final must be finished with a winner' },
    { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.querySelector('.round-message[role="alert"]')?.textContent).toContain('Todos los partidos');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectNone('/api/tournaments/7/next-round');
    expect(Array.from(element.querySelectorAll('button')).some(button => button.textContent === 'Actualizar partidos')).toBe(true);
  });

  it('does not repeat an ambiguous next-round POST until the real bracket is refreshed', () => {
    load(readyForNextRound());
    fixture.componentInstance.nextRoundForm.setValue({ match_date: '2026-11-02T18:30' });
    const form = element.querySelector('.next-round-panel form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne('/api/tournaments/7/next-round').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('.round-message[role="alert"]')?.textContent).toContain('No se pudo confirmar');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectNone('/api/tournaments/7/next-round');
  });

  it('shows both empty states when the tournament has no real matches', () => {
    load(bracket([]));
    const statuses = Array.from(element.querySelectorAll('[role="status"]')).map(item => item.textContent);
    expect(statuses.some(text => text?.includes('no hay partidos para mostrar'))).toBe(true);
    expect(statuses.some(text => text?.includes('no hay partidos registrados'))).toBe(true);
    expect(element.querySelector('table')).toBeNull();
  });

  it('opens the existing result form with complete names and current values', () => {
    openResultForm();
    expect(element.querySelector('form h3')?.textContent).toContain(`${match.home_team!.name} vs. ${match.away_team!.name}`);
    expect(element.querySelector<HTMLInputElement>('#home-goals-20')?.value).toBe('1');
    expect(element.querySelector<HTMLInputElement>('#away-goals-20')?.value).toBe('0');
    expect(element.querySelector<HTMLSelectElement>('#result-status-20')?.value).toBe('live');
    expect(element.querySelector('.selected-match')).not.toBeNull();
  });

  it('updates a live result and reloads one canonical bracket for both views', () => {
    openResultForm();
    fixture.componentInstance.resultForm.setValue({
      home_goals: 3,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      status: 'live',
    });
    submitResult();
    const put = http.expectOne('/api/matches/20');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.home_goals).toBe(3);
    expect(put.request.body.away_goals).toBe(1);
    put.flush({ data: { ...match, home_goals: 3, away_goals: 1 } });

    const refreshed = { ...match, home_goals: 3, away_goals: 1 };
    const get = http.expectOne('/api/tournaments/7/bracket');
    expect(get.request.method).toBe('GET');
    get.flush(bracket([refreshed, otherMatch]));
    fixture.detectChanges();

    expect(element.querySelector('app-bracket .match-card.selected')?.textContent).toContain('3');
    expect(element.querySelector('tr.selected-row .result')?.textContent).toContain('3 - 1');
    expect(element.querySelector('.selected-match')?.textContent).toContain('3 - 1');
    expect(element.textContent).toContain('Marcador actualizado');
    expect(element.querySelector('form')).toBeNull();
  });

  it('finishes a match, synchronizes the server winner and closes result editing', () => {
    openResultForm();
    fixture.componentInstance.resultForm.setValue({
      home_goals: 2,
      away_goals: 0,
      home_penalties: null,
      away_penalties: null,
      status: 'finished',
    });
    submitResult();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('ya no podrá modificarse'));
    http.expectOne('/api/matches/20').flush({ data: { ...match, home_goals: 2, away_goals: 0,
      winner_team_id: 10, winner_team: match.home_team, status: 'finished' } });
    const finished = { ...match, home_goals: 2, away_goals: 0, winner_team_id: 10,
      winner_team: match.home_team, status: 'finished' as const };
    http.expectOne('/api/tournaments/7/bracket').flush(bracket([finished, otherMatch]));
    fixture.detectChanges();
    expect(element.querySelector('app-bracket .team.winner .team-name')?.textContent).toBe(match.home_team!.name);
    expect(element.querySelector('tr.selected-row .actions')?.textContent).toContain('Resultado cerrado');
    expect(element.textContent).toContain('partido quedó finalizado');
  });

  it('shows the full champion name returned by the backend after completing the final', () => {
    const finalMatch: BracketMatch = { ...match, id: 40, round: 'final', status: 'live',
      home_goals: 1, away_goals: 1, winner_team_id: null, winner_team: null };
    const finalBracket: TournamentBracket = {
      tournament: { ...tournament, champion: null },
      rounds: [{ round: 'final', matches: [finalMatch] }],
    };
    openResultForm(finalBracket);
    fixture.componentInstance.resultForm.setValue({
      home_goals: 2,
      away_goals: 1,
      home_penalties: null,
      away_penalties: null,
      status: 'finished',
    });
    submitResult();
    http.expectOne('/api/matches/40').flush({ data: { ...finalMatch, status: 'finished',
      home_goals: 2, away_goals: 1, winner_team_id: finalMatch.home_team_id,
      winner_team: finalMatch.home_team } });
    const championName = 'Club Deportivo Los Halcones del Norte';
    const completedMatch = { ...finalMatch, status: 'finished' as const, home_goals: 2, away_goals: 1,
      winner_team_id: finalMatch.home_team_id, winner_team: finalMatch.home_team };
    http.expectOne('/api/tournaments/7/bracket').flush({
      tournament: { ...tournament, status: 'finished', champion_team_id: finalMatch.home_team_id,
        champion: { id: finalMatch.home_team_id, name: championName, has_logo: false } },
      rounds: [{ round: 'final', matches: [completedMatch] }],
    });
    fixture.detectChanges();
    expect(element.querySelector('.champion')?.textContent).toContain(championName);
    expect(element.querySelector('.next-round-panel')).toBeNull();
  });

  it('requires non-tied penalties before sending a finished tied result', () => {
    openResultForm();
    fixture.componentInstance.resultForm.setValue({
      home_goals: 2,
      away_goals: 2,
      home_penalties: null,
      away_penalties: null,
      status: 'finished',
    });
    fixture.detectChanges();
    expect(element.querySelector('#home-penalties-20')).not.toBeNull();
    submitResult();
    expect(element.querySelector('form [role="alert"]')?.textContent).toContain('penales de ambos equipos');
    http.expectNone('/api/matches/20');
    fixture.componentInstance.resultForm.patchValue({ home_penalties: 4, away_penalties: 4 });
    submitResult();
    expect(element.querySelector('form [role="alert"]')?.textContent).toContain('definir un ganador');
    http.expectNone('/api/matches/20');
  });

  it('does not offer result entry before the scheduled date', () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-10-20T12:00:00Z'));
    const future = { ...match, status: 'scheduled' as const, home_goals: null, away_goals: null,
      match_date: '2026-10-31T18:00:00.000Z' };
    load(bracket([future, otherMatch]));
    const firstMatchActions = element.querySelector('tbody tr:not(.form-row) .actions');
    expect(firstMatchActions?.querySelector('button')).toBeNull();
    expect(firstMatchActions?.textContent).toContain('Disponible desde 31/10/2026');
  });

  it('shows backend validation without losing entered values or refreshing', () => {
    openResultForm();
    fixture.componentInstance.resultForm.patchValue({ home_goals: 2, away_goals: 1, status: 'finished' });
    submitResult();
    http.expectOne('/api/matches/20').flush({ message: 'Invalid match data',
      errors: ['a finished match cannot have a future match_date'] }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(element.querySelector('form [role="alert"]')?.textContent).toContain('fecha programada es futura');
    expect(fixture.componentInstance.resultForm.controls.home_goals.value).toBe(2);
    http.expectNone('/api/tournaments/7/bracket');
  });

  it('requires refresh if PUT succeeded but canonical bracket synchronization failed', () => {
    openResultForm();
    fixture.componentInstance.resultForm.patchValue({ home_goals: 2 });
    submitResult();
    http.expectOne('/api/matches/20').flush({ data: { ...match, home_goals: 2 } });
    http.expectOne('/api/tournaments/7/bracket').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(element.querySelector('form [role="alert"]')?.textContent).toContain('resultado se guardó');
    expect(Array.from(element.querySelectorAll('button')).some(button => button.textContent === 'Actualizar partidos')).toBe(true);
    submitResult();
    http.expectNone(request => request.method === 'PUT');
  });

  it('never retries an ambiguous PUT and refreshes only when requested', () => {
    openResultForm();
    fixture.componentInstance.resultForm.patchValue({ home_goals: 2 });
    submitResult();
    http.expectOne('/api/matches/20').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('form [role="alert"]')?.textContent).toContain('No se pudo confirmar');
    submitResult();
    http.expectNone(request => request.method === 'PUT');
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Actualizar partidos')?.click();
    http.expectOne('/api/tournaments/7/bracket').flush(bracket());
    fixture.detectChanges();
    expect(element.querySelector('form')).toBeNull();
  });

  it.each([null, '', 'abc', '0', '-1', '1.5', ' 7 ', '2147483648'])('rejects invalid tournament ID %s without HTTP', id => {
    params.next(convertToParamMap(id === null ? {} : { id }));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('identificador');
    expect(element.querySelector('button')).toBeNull();
    http.expectNone(() => true);
  });

  it('shows a non-retryable not-found state', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7/bracket').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se encontró el torneo');
    expect(element.querySelector('button')).toBeNull();
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/tournaments');
  });

  it('retries a load error without creating parallel requests', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7/bracket').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const retry = element.querySelector<HTMLButtonElement>('button');
    expect(retry?.textContent).toBe('Reintentar');
    retry?.click();
    retry?.click();
    http.expectOne('/api/tournaments/7/bracket').flush(bracket());
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('cancels a stale unified request when the route changes', () => {
    fixture.detectChanges();
    const previous = http.expectOne('/api/tournaments/7/bracket');
    params.next(convertToParamMap({ id: '8' }));
    expect(previous.cancelled).toBe(true);
    const other = bracket();
    other.tournament = { ...other.tournament, id: 8, name: 'Otra copa' };
    http.expectOne('/api/tournaments/8/bracket').flush(other);
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe('Partidos y cuadro de Otra copa');
  });

  it('links back to the tournament detail', () => {
    load();
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/tournaments/7');
  });
});
