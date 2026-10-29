import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthenticatedUser } from '../../../models/auth';
import { Tournament } from '../../../models/tournament';
import { TournamentList } from './tournament-list';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../../../core/services/auth';

describe('TournamentList', () => {
  let fixture: ComponentFixture<TournamentList>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let currentUser: WritableSignal<AuthenticatedUser | null>;
  const organizer: AuthenticatedUser = {
    id: 1, name: 'Organizador', email: 'owner@example.test', role: 'organizer', created_at: '2026-01-01',
  };
  const group = (id: string) => element.querySelector<HTMLElement>(`section[aria-labelledby="group-${id}"]`);
  const tournament: Tournament = { organizer_id: 1,
    id: 7, name: 'Copa de prueba', location: 'Firmat',
    rules: 'official_rules_football_5', format: 'knockout', modality: 'futbol_5',
    max_teams: 16, status: 'open', champion_team_id: null,
    created_at: '2026-09-30T12:00:00.000Z',
  };

  beforeEach(async () => {
    currentUser = signal<AuthenticatedUser | null>(organizer);
    await TestBed.configureTestingModule({
      imports: [TournamentList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: Auth, useValue: { user: currentUser } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TournamentList);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it.each([null, { id: 9, name: 'Otro organizador', email: 'other@example.test', role: 'organizer' as const, created_at: '2026-01-01' }])(
    'keeps the list public without management actions for %j', user => {
      currentUser.set(user);
      http.expectOne('/api/tournaments').flush([tournament]);
      fixture.detectChanges();
      expect(element.querySelector('.detail-link')).not.toBeNull();
      expect(element.querySelector('.card-menu')).toBeNull();
      expect(element.querySelector('button[aria-label^="Eliminar"]')).toBeNull();
    },
  );

  it('shows management actions to an administrator for a tournament owned by someone else', () => {
    currentUser.set({
      id: 9, name: 'Admin', email: 'admin@example.test', role: 'admin', created_at: '2026-01-01',
    });
    http.expectOne('/api/tournaments').flush([tournament]);
    fixture.detectChanges();
    expect(element.querySelector('.card-menu')).not.toBeNull();
    expect(element.querySelector('a[aria-label^="Editar"]')).not.toBeNull();
    expect(group('mine')?.querySelector('.tournament-card')).toBeNull();
    expect(group('others')?.querySelector('.tournament-card')?.textContent).toContain(tournament.name);
  });

  describe('ownership groups', () => {
    const other: Tournament = { ...tournament, id: 8, organizer_id: 2, name: 'Copa visitante', status: 'in_progress' };
    const legacy: Tournament = { ...tournament, id: 9, organizer_id: null, name: 'Copa histórica', status: 'finished', champion_team_id: 10 };
    const cardNames = (id: string) => Array.from(group(id)?.querySelectorAll('.card-heading h3') ?? [], card => card.textContent);

    it('separates owned tournaments from other owners and legacy tournaments without hiding any status', () => {
      http.expectOne('/api/tournaments').flush([other, tournament, legacy]);
      fixture.detectChanges();
      expect(cardNames('mine')).toEqual([tournament.name]);
      expect(cardNames('others')).toEqual([other.name, legacy.name]);
      expect(group('mine')?.querySelector('.group-count')?.textContent?.trim()).toBe('1 torneo');
      expect(group('others')?.querySelector('.group-count')?.textContent?.trim()).toBe('2 torneos');
      expect(element.querySelectorAll('.tournament-card')).toHaveLength(3);
      expect(group('others')?.querySelector('.card-menu')).toBeNull();
    });

    it('keeps all tournaments together for visitors with links to their public details', () => {
      currentUser.set(null);
      http.expectOne('/api/tournaments').flush([tournament, other, legacy]);
      fixture.detectChanges();
      expect(element.querySelectorAll('.tournament-group')).toHaveLength(1);
      expect(cardNames('public')).toEqual([tournament.name, other.name, legacy.name]);
      expect(group('mine')).toBeNull();
      expect(group('public')?.querySelectorAll('.detail-link')).toHaveLength(3);
      expect(element.querySelector('.card-menu')).toBeNull();
    });

    it('regroups the loaded list when the session is restored, changes account or is cleared', () => {
      currentUser.set(null);
      http.expectOne('/api/tournaments').flush([tournament, other, legacy]);
      fixture.detectChanges();
      expect(cardNames('public')).toHaveLength(3);
      currentUser.set(organizer);
      fixture.detectChanges();
      expect(cardNames('mine')).toEqual([tournament.name]);
      expect(cardNames('others')).toEqual([other.name, legacy.name]);
      currentUser.set({ ...organizer, id: 2 });
      fixture.detectChanges();
      expect(cardNames('mine')).toEqual([other.name]);
      expect(cardNames('others')).toEqual([tournament.name, legacy.name]);
      currentUser.set(null);
      fixture.detectChanges();
      expect(group('mine')).toBeNull();
      expect(cardNames('public')).toHaveLength(3);
      http.expectNone('/api/tournaments');
    });

    it.each([
      ['mine', [other], 'Todavía no creaste ningún torneo.'],
      ['others', [tournament], 'Todavía no hay otros torneos.'],
    ] as const)('shows an empty state for %s without hiding the populated group', (id, values, message) => {
      http.expectOne('/api/tournaments').flush(values);
      fixture.detectChanges();
      expect(group(id)?.querySelector('[role="status"]')?.textContent).toContain(message);
      expect(group(id)?.querySelector('.tournament-grid')).toBeNull();
      expect(element.querySelectorAll('.tournament-card')).toHaveLength(1);
    });
  });

  it('opens the options disclosure and closes it with Escape, returning focus', () => {
    http.expectOne('/api/tournaments').flush([tournament]);
    fixture.detectChanges();
    const menu = element.querySelector<HTMLDetailsElement>('details')!;
    const summary = menu.querySelector('summary')!;
    expect(menu.open).toBe(false);
    summary.click();
    expect(menu.open).toBe(true);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  describe('deletion', () => {
    afterEach(() => vi.restoreAllMocks());
    const second: Tournament = { ...tournament, id: 8, name: 'Otra copa' };
    const button = (id = 7) => element.querySelector<HTMLButtonElement>(`button[aria-label="Eliminar ${id === 7 ? tournament.name : second.name}"]`);
    const load = (values = [tournament]) => {
      http.expectOne('/api/tournaments').flush(values);
      fixture.detectChanges();
    };

    it('shows Eliminar and leaves the list unchanged when confirmation is cancelled', () => {
      load();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      expect(button()?.textContent).toContain('Eliminar');
      button()?.click();
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining(tournament.name));
      http.expectNone((request) => request.method === 'DELETE');
      fixture.detectChanges();
      expect(element.querySelectorAll('.tournament-card')).toHaveLength(1);
      expect(element.querySelector('[role="alert"]')).toBeNull();
    });

    it('confirms, prevents duplicate DELETE and refreshes the list on success', () => {
      load([tournament, second]);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      button()?.click();
      button()?.click();
      fixture.detectChanges();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(button()?.disabled).toBe(true);
      expect(button()?.textContent).toContain('Eliminando');
      expect(button(8)?.disabled).toBe(false);
      const request = http.expectOne('/api/tournaments/7');
      expect(request.request.method).toBe('DELETE');
      request.flush({ message: 'Tournament deleted successfully' });
      const refresh = http.expectOne('/api/tournaments');
      expect(refresh.request.method).toBe('GET');
      refresh.flush([second]);
      fixture.detectChanges();
      expect(element.textContent).not.toContain(tournament.name);
      expect(element.textContent).toContain(second.name);
    });

    it('allows deleting different tournaments concurrently and refreshes after both complete', () => {
      load([tournament, second]);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      button()?.click();
      button(8)?.click();
      http.expectOne('/api/tournaments/7').flush({ message: 'Tournament deleted successfully' });
      const firstRefresh = http.expectOne('/api/tournaments');
      http.expectOne('/api/tournaments/8').flush({ message: 'Tournament deleted successfully' });
      firstRefresh.flush([second]);
      http.expectOne('/api/tournaments').flush([]);
      fixture.detectChanges();
      expect(element.querySelector('.tournament-grid')).toBeNull();
      expect(group('mine')?.textContent).toContain('Todavía no creaste ningún torneo.');
      expect(group('others')?.textContent).toContain('Todavía no hay otros torneos.');
    });

    it.each(['in_progress', 'finished'] as const)('disables deletion for %s tournaments', (status) => {
      load([{ ...tournament, status }]);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      expect(button()?.disabled).toBe(true);
      button()?.click();
      expect(confirm).not.toHaveBeenCalled();
      http.expectNone((request) => request.method === 'DELETE');
    });

    it.each([
      [400, 'Invalid tournament id', 'datos no son válidos'],
      [404, 'Tournament not found', 'ya no existe'],
      [409, 'A tournament with competitive history cannot be deleted', 'partidos finalizados'],
      [503, 'Service unavailable', 'No se pudo conectar'],
      [500, 'raw database error', 'error inesperado'],
    ])('handles HTTP %s, keeps the row and allows retry', (status, message, expected) => {
      load();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      button()?.click();
      http.expectOne('/api/tournaments/7').flush({ error: true, message }, { status, statusText: 'Error' });
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(expected);
      expect(element.textContent).not.toContain('raw database error');
      expect(element.querySelector('.tournament-grid')?.textContent).toContain(tournament.name);
      expect(button()?.disabled).toBe(false);
      http.expectNone('/api/tournaments');
      button()?.click();
      http.expectOne('/api/tournaments/7').flush({ message: 'Tournament deleted successfully' });
      http.expectOne('/api/tournaments').flush([]);
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')).toBeNull();
    });

    it('handles a network failure without removing the tournament', () => {
      load();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      button()?.click();
      http.expectOne('/api/tournaments/7').error(new ProgressEvent('error'));
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar');
      expect(element.querySelector('.tournament-grid')?.textContent).toContain(tournament.name);
      expect(button()?.disabled).toBe(false);
    });

    it('cancels a pending DELETE when the list is destroyed', () => {
      load();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      button()?.click();
      const request = http.expectOne('/api/tournaments/7');
      fixture.destroy();
      expect(request.cancelled).toBe(true);
      http.expectNone('/api/tournaments');
    });
  });

  it('navigates Editar to the corresponding tournament with Angular Router', async () => {
    http.expectOne('/api/tournaments').flush([tournament]);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = element.querySelector<HTMLAnchorElement>('.tournament-card a[aria-label^="Editar "]');
    expect(link?.textContent).toBe('Editar');
    expect(link?.getAttribute('href')).toBe('/tournaments/7/edit');
    link?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0]?.[0].toString()).toBe('/tournaments/7/edit');
  });

  it('links Crear torneo to the creation route using Angular Router', async () => {
    http.expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = element.querySelector<HTMLAnchorElement>('.create-link');
    expect(link?.textContent).toContain('Crear torneo');
    expect(link?.getAttribute('href')).toBe('/tournaments/new');
    link?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0]?.[0].toString()).toBe('/tournaments/new');
  });

  it('links Ver detalle to the correct tournament with Angular Router', async () => {
    http.expectOne('/api/tournaments').flush([tournament]);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = element.querySelector<HTMLAnchorElement>('.tournament-card a[aria-label^="Ver detalle de "]');
    expect(link?.textContent).toBe('Ver detalle');
    expect(link?.getAttribute('href')).toBe('/tournaments/7');
    link?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0]?.[0].toString()).toBe('/tournaments/7');
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
    expect(element.querySelectorAll('.tournament-card')).toHaveLength(1);
    for (const value of ['Copa de prueba', 'Firmat', 'Abierto', 'Futbol 5', '16 equipos', 'Capacidad m\u00e1xima']) {
      expect(element.textContent).toContain(value);
    }
  });

  it('shows both empty groups when the signed-in list has no tournaments', () => {
    http.expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    expect(group('mine')?.textContent).toContain('Todavía no creaste ningún torneo.');
    expect(group('others')?.textContent).toContain('Todavía no hay otros torneos.');
    expect(element.querySelector('.tournament-grid')).toBeNull();
  });

  it('shows the public empty state when no tournaments have been created', () => {
    currentUser.set(null);
    http.expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    expect(group('public')?.textContent).toContain('No hay torneos registrados.');
    expect(element.querySelector('.tournament-grid')).toBeNull();
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
