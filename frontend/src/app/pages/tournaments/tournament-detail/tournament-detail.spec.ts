import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';
import { TournamentDetail } from './tournament-detail';
import { Auth } from '../../../core/services/auth';

describe('TournamentDetail', () => {
  let fixture: ComponentFixture<TournamentDetail>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const tournament: Tournament = { organizer_id: 1,
    id: 7, name: 'Copa Regional', location: 'Firmat', modality: 'futbol_7',
    max_teams: 8, rules: 'official_rules_football_7', format: 'knockout',
    status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z',
  };
  const load = (value = tournament) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    await TestBed.configureTestingModule({
      imports: [TournamentDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: Auth, useValue: { user: () => ({ id: 1, role: 'organizer' }) } },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TournamentDetail);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => { fixture.destroy(); http.verify(); vi.restoreAllMocks(); });

  it('creates the component and loads the route ID through the existing service', () => {
    const getById = vi.spyOn(TestBed.inject(TournamentService), 'getById');
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(getById).toHaveBeenCalledExactlyOnceWith(7);
    expect(element.textContent).toContain('Cargando torneo...');
    expect(element.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    const request = http.expectOne('/api/tournaments/7');
    expect(request.request.method).toBe('GET');
    request.flush(tournament);
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe(tournament.name);
    expect(element.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
    expect(element.textContent).not.toContain('Cargando');
  });

  it('renders the real fields using understandable labels', () => {
    load();
    for (const text of ['Copa Regional', 'Firmat', 'F\u00fatbol 7', 'Abierto', '8 equipos',
      'Reglamento oficial de f\u00fatbol 7', 'Eliminaci\u00f3n directa', '02/10/2026']) {
      expect(element.textContent).toContain(text);
    }
    expect(element.textContent).not.toContain('Campe\u00f3n');
    expect(element.textContent).not.toContain('official_rules_football_7');
  });

  it('does not duplicate the champion or request its team in the detail', () => {
    load({ ...tournament, status: 'finished', champion_team_id: 42 });
    expect(element.textContent).toContain('Finalizado');
    expect(element.querySelector('.champion-panel')).toBeNull();
    http.expectNone('/api/teams/42');
  });

  it('preserves an unknown rule identifier instead of inventing a label', () => {
    load({ ...tournament, rules: 'future_rules' });
    expect(element.textContent).toContain('future_rules');
  });

  it.each([null, '', 'abc', '0', '-1', '1.5', '1e2', ' 7 ', '2147483648'])('rejects invalid ID %s without HTTP', (id) => {
    params.next(convertToParamMap(id === null ? {} : { id }));
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('identificador');
    expect(element.querySelector('button')).toBeNull();
    expect(element.querySelector('dl')).toBeNull();
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/tournaments');
  });

  it.each([400, 404])('handles HTTP %s without offering a pointless retry', (status) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush({ message: 'raw error' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(status === 404 ? 'No se encontr\u00f3' : 'identificador');
    expect(element.querySelector('button')).toBeNull();
    expect(element.querySelector('dl')).toBeNull();
    expect(element.textContent).not.toContain('raw error');
  });

  it.each([500, 502, 503, 504])('handles backend error %s and retries the same ID', (status) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush({ message: 'raw database error' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(status === 500 ? 'error inesperado' : 'conectar con el servidor');
    expect(element.textContent).not.toContain('raw database error');
    const button = element.querySelector('button');
    expect(button?.textContent).toBe('Reintentar');
    button?.click();
    button?.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.textContent).toContain('Cargando torneo');
    http.expectOne('/api/tournaments/7').flush(tournament);
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe(tournament.name);
  });

  it('handles a network failure and permits retry', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('conectar con el servidor');
    expect(element.querySelector('button')?.textContent).toBe('Reintentar');
  });

  it('cancels stale requests when navigating between tournament IDs', () => {
    fixture.detectChanges();
    const previous = http.expectOne('/api/tournaments/7');
    params.next(convertToParamMap({ id: '8' }));
    fixture.detectChanges();
    expect(previous.cancelled).toBe(true);
    expect(element.textContent).toContain('Cargando torneo');
    http.expectOne('/api/tournaments/8').flush({ ...tournament, id: 8, name: 'Otra copa' });
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe('Otra copa');
  });

  it('clears a previous tournament when the next ID is invalid', () => {
    load();
    params.next(convertToParamMap({ id: 'abc' }));
    fixture.detectChanges();
    expect(element.textContent).not.toContain(tournament.name);
    expect(element.querySelector('dl')).toBeNull();
    http.expectNone(() => true);
  });

  it('can navigate to a valid ID after a 404', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush({}, { status: 404, statusText: 'Not Found' });
    params.next(convertToParamMap({ id: '8' }));
    http.expectOne('/api/tournaments/8').flush({ ...tournament, id: 8 });
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent).toBe(tournament.name);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    ['Volver a torneos', '/tournaments'],
    ['Editar torneo', '/tournaments/7/edit'],
    ['EQUIPOS', '/tournaments/7/teams'],
    ['PARTIDOS Y CUADRO', '/tournaments/7/matches'],
  ])('navigates using %s', async (label, target) => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = Array.from(element.querySelectorAll('a')).find((link) =>
      (link.getAttribute('aria-label') ?? link.textContent?.trim()) === label);
    expect(link?.getAttribute('href')).toBe(target);
    link?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0]?.[0].toString()).toBe(target);
  });

  it('keeps only the two unique tournament accesses and removes the duplicated pre-match panel', () => {
    load();
    const links = Array.from(element.querySelectorAll('.tournament-links a'));
    expect(links).toHaveLength(2);
    expect(links.map(link => link.textContent?.trim())).toEqual([
      expect.stringContaining('EQUIPOS'),
      expect.stringContaining('PARTIDOS Y CUADRO'),
    ]);
    expect(element.textContent).not.toContain('Antes del primer partido');
    expect(element.textContent).not.toContain('Ver cuadro');
    expect(element.querySelector('a[href="/tournaments/7/bracket"]')).toBeNull();
  });

  it('cancels the request on destruction', () => {
    fixture.detectChanges();
    const request = http.expectOne('/api/tournaments/7');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
