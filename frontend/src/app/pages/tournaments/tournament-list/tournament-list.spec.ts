import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Tournament } from '../../../models/tournament';
import { TournamentList } from './tournament-list';
import { provideRouter, Router } from '@angular/router';

describe('TournamentList', () => {
  let fixture: ComponentFixture<TournamentList>;
  let http: HttpTestingController;
  let element: HTMLElement;
  const tournament: Tournament = {
    id: 7, name: 'Copa de prueba', location: 'Firmat',
    rules: 'official_rules_football_5', format: 'knockout', modality: 'futbol_5',
    max_teams: 16, status: 'open', champion_team_id: null,
    created_at: '2026-09-30T12:00:00.000Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TournamentList);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('links Crear torneo to the creation route using Angular Router', async () => {
    http.expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = element.querySelector<HTMLAnchorElement>('a');
    expect(link?.textContent).toContain('Crear torneo');
    expect(link?.getAttribute('href')).toBe('/tournaments/new');
    link?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0]?.[0].toString()).toBe('/tournaments/new');
  });

  it('shows loading until the initial request completes', () => {
    expect(element.textContent).toContain('Cargando torneos...');
    expect(element.textContent).not.toContain('No hay torneos registrados.');
    http.expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Cargando torneos...');
  });

  it('renders the returned records and labels capacity accurately', () => {
    http.expectOne('/api/tournaments').flush([tournament]);
    fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    for (const value of ['Copa de prueba', 'Firmat', 'Abierto', 'Futbol 5', '16 equipos', 'Capacidad m\u00e1xima']) {
      expect(element.textContent).toContain(value);
    }
  });

  it('shows an empty state without a table', () => {
    http.expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    expect(element.textContent).toContain('No hay torneos registrados.');
    expect(element.querySelector('table')).toBeNull();
  });

  it('shows a server error and allows retrying successfully', () => {
    http.expectOne('/api/tournaments').flush({}, { status: 500, statusText: 'Server error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    element.querySelector('button')?.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.textContent).toContain('Cargando torneos...');
    http.expectOne('/api/tournaments').flush([tournament]);
    fixture.detectChanges();
    expect(element.textContent).toContain(tournament.name);
  });

  it('shows a connection error without exposing technical details', () => {
    http.expectOne('/api/tournaments').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar');
  });

  it('cancels the pending request when the component is destroyed', () => {
    const request = http.expectOne('/api/tournaments');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
