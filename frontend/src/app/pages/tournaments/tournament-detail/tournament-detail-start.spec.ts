import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';
import { TournamentDetail } from './tournament-detail';
import { Auth } from '../../../core/services/auth';

describe('TournamentDetail start action', () => {
  let fixture: ComponentFixture<TournamentDetail>;
  let component: TournamentDetail;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const tournament: Tournament = { id: 7, name: 'Copa Regional', location: 'Firmat', modality: 'futbol_7', max_teams: 8, rules: 'official_rules_football_7', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-09T12:00:00.000Z' };
  const date = '2030-01-02T12:00';
  const load = (value = tournament) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(value);
    fixture.detectChanges();
  };
  const submit = () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const start = () => {
    load();
    component.matchDate.setValue(date);
    submit();
    return http.expectOne('/api/tournaments/7/start');
  };

  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2030-01-01T12:00:00Z'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    await TestBed.configureTestingModule({ imports: [TournamentDetail], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: Auth, useValue: { user: () => ({ id: 1 }) } },
      { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TournamentDetail);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it('shows the action, required team count and Argentina date input for an open tournament without extra reads', () => {
    load();
    expect(element.querySelector('button[type="submit"]')?.textContent).toBe('Iniciar torneo');
    expect(element.textContent).toContain('exactamente 8 equipos');
    expect(element.textContent).toContain('ning\u00fan partido previo');
    expect(element.textContent).toContain('(Argentina)');
    expect(element.querySelector('input')?.type).toBe('datetime-local');
    http.expectNone('/api/teams');
    http.expectNone('/api/matches');
  });

  it.each(['in_progress', 'finished'] as const)('does not permit starting a %s tournament', status => {
    load({ ...tournament, status });
    expect(element.querySelector('form')).toBeNull();
    component['startTournament']();
    expect(window.confirm).not.toHaveBeenCalled();
    http.expectNone(request => request.method === 'POST');
  });

  it('does not start during loading or after a failed detail load', () => {
    fixture.detectChanges();
    component['startTournament']();
    http.expectOne('/api/tournaments/7').flush({}, { status: 404, statusText: 'Not Found' });
    component['startTournament']();
    expect(window.confirm).not.toHaveBeenCalled();
    http.expectNone(request => request.method === 'POST');
  });

  it.each(['', 'invalid', '2029-12-31T12:00', '2030-01-01T09:00', '2030-02-30T12:00', '2030-13-01T12:00', '2030-01-02T24:00', '0000-01-01T12:00'])('rejects missing, past or invalid date %s before confirmation', value => {
    load();
    component.matchDate.setValue(value);
    submit();
    expect(component.matchDate.invalid).toBe(true);
    expect(element.querySelector('#match-date-error')).not.toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
    http.expectNone(request => request.method === 'POST');
  });

  it('uses Argentina time regardless of the browser timezone and supports leap days', () => {
    load();
    component.matchDate.setValue('2030-01-01T09:01');
    expect(component.matchDate.valid).toBe(true);
    component.matchDate.setValue('2032-02-29T12:00');
    expect(component.matchDate.valid).toBe(true);
    component.matchDate.setValue('2030-02-29T12:00');
    expect(component.matchDate.invalid).toBe(true);
  });

  it('cancelling confirmation does not send HTTP or lose the selected date', () => {
    load();
    vi.mocked(window.confirm).mockReturnValue(false);
    component.matchDate.setValue(date);
    submit();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('4 partidos de la primera ronda'));
    expect(component.matchDate.value).toBe(date);
    http.expectNone(request => request.method === 'POST');
    expect(element.querySelector('button[type="submit"]')?.textContent).toBe('Iniciar torneo');
  });

  it('revalidates a date that expires while confirmation is open', () => {
    load();
    component.matchDate.setValue('2030-01-01T09:01');
    vi.mocked(window.confirm).mockImplementation(() => {
      vi.mocked(Date.now).mockReturnValue(Date.parse('2030-01-01T12:02:00Z'));
      return true;
    });
    submit();
    expect(component.matchDate.invalid).toBe(true);
    http.expectNone(request => request.method === 'POST');
  });

  it('starts once with the route ID, prevents double submission and uses the updated response', () => {
    const method = vi.spyOn(TestBed.inject(TournamentService), 'start');
    const request = start();
    submit();
    expect(method).toHaveBeenCalledExactlyOnceWith(7, { match_date: '2030-01-02 12:00' });
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(element.querySelector('button[type="submit"]')?.textContent).toBe('Iniciando...');
    expect(element.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true);
    expect(element.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('a[href="/tournaments/7/teams"]')).not.toBeNull();
    http.expectNone(request => request.method === 'POST');
    request.flush({ message: 'Tournament started successfully', data: { tournament: { ...tournament, name: 'Copa actualizada', status: 'in_progress' }, matches: [] } }, { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe('Copa actualizada');
    expect(element.textContent).toContain('En curso');
    expect(element.textContent).toContain('Torneo iniciado');
    expect(element.querySelector('form')).toBeNull();
    http.expectNone(() => true);
  });

  it('does not manually force the returned status to in_progress', () => {
    start().flush({ data: { tournament: { ...tournament, status: 'finished', champion_team_id: 42 }, matches: [] } });
    fixture.detectChanges();
    expect(element.textContent).toContain('Finalizado');
    expect(element.textContent).toContain('Consultando nombre');
    http.expectOne('/api/teams/42').flush({ data: {
      id: 42, tournament_id: 7, name: 'Club Campe\u00f3n', players_count: 14,
      created_at: '2030-01-01T12:00:00.000Z',
    } });
    fixture.detectChanges();
    expect(element.textContent).toContain('Club Campe\u00f3n');
    expect(element.textContent).not.toContain('Equipo #42');
    expect(element.textContent).not.toContain('En curso');
  });

  it.each([
    ['Tournament requires exactly 8 teams and has 6', 'exactamente 8 equipos y tiene 6'],
    ['Invalid tournament start data', 'fecha y hora futuras'],
    ['Team 15 is not valid for this tournament', 'equipos no v\u00e1lidos'],
    ['Tournament teams must be unique', 'duplicados'],
    ['Tournament configuration is not valid for starting', 'configuraci\u00f3n actual'],
    ['Tournament capacity must be one of: 4, 8, 16, 32', 'configuraci\u00f3n actual'],
  ])('explains backend validation: %s', (message, expected) => {
    start().flush({ error: true, message }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(expected);
    expect(element.textContent).not.toContain(message);
    expect(element.textContent).toContain('Abierto');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(component.matchDate.value).toBe(date);
  });

  it('allows retrying corrected data after a validation error', () => {
    start().flush({ message: 'Invalid tournament start data' }, { status: 400, statusText: 'Error' });
    component.matchDate.setValue('2030-01-03T12:00');
    submit();
    const request = http.expectOne('/api/tournaments/7/start');
    expect(request.request.body).toEqual({ match_date: '2030-01-03 12:00' });
    request.flush({ data: { tournament: { ...tournament, status: 'in_progress' }, matches: [] } });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('removes stale data and actions if the tournament disappears before starting', () => {
    start().flush({ message: 'Tournament not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.textContent).toContain('No se encontr\u00f3 el torneo');
    expect(element.querySelector('dl')).toBeNull();
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/tournaments');
  });

  it.each([
    ['Tournament cannot start from status in_progress', 'ya fue iniciado'],
    ['Tournament cannot start from status finished', 'finalizado'],
    ['Tournament already has registered matches', 'partidos registrados'],
    ['unknown technical error', 'estado del torneo cambi\u00f3'],
  ])('handles conflict %s and refreshes with the real state', (message, expected) => {
    start().flush({ message }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(expected);
    expect(element.textContent).not.toContain(message);
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    submit();
    http.expectNone(request => request.method === 'POST');
    Array.from(element.querySelectorAll('button')).find(button => button.textContent === 'Actualizar torneo')?.click();
    http.expectOne('/api/tournaments/7').flush({ ...tournament, status: 'in_progress' });
    fixture.detectChanges();
    expect(element.textContent).toContain('En curso');
    expect(element.querySelector('form')).toBeNull();
  });

  it.each([0, 500, 502, 503, 504])('requires a state refresh after ambiguous error %s without retrying POST', status => {
    const request = start();
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ message: 'raw database error' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.textContent).toContain('No se pudo confirmar el inicio');
    expect(element.textContent).not.toContain('raw database');
    submit();
    http.expectNone(request => request.method === 'POST');
    component['refreshTournament']();
    http.expectOne('/api/tournaments/7').flush(tournament);
    fixture.detectChanges();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(component.matchDate.value).toBe('');
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('cancels observation of a pending start on route change and clears date and messages', () => {
    const request = start();
    params.next(convertToParamMap({ id: '8' }));
    expect(request.cancelled).toBe(true);
    http.expectOne('/api/tournaments/8').flush({ ...tournament, id: 8, name: 'Otro torneo' });
    fixture.detectChanges();
    expect(component.matchDate.value).toBe('');
    expect(element.textContent).not.toContain('Iniciando...');
    expect(element.querySelector('h1')?.textContent).toBe('Otro torneo');
  });

  it('cancels observation of a pending start on destruction', () => {
    const request = start();
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
