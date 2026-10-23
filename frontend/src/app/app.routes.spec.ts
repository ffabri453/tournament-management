import { of } from 'rxjs';
import { Auth } from './core/services/auth';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { Login } from './pages/login/login';
import { TournamentForm } from './pages/tournaments/tournament-form/tournament-form';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';
import { TournamentDetail } from './pages/tournaments/tournament-detail/tournament-detail';
import { MatchList } from './pages/matches/match-list/match-list';

describe('Tournament creation routing', () => {
  it('registers the tournament match-list route', () => {
    expect(routes).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'tournaments/:id/matches', component: MatchList })]));
  });

  it('registers the tournament bracket route', () => {
    expect(routes).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'tournaments/:id/bracket', component: MatchList })]));
  });

  it('loads the real login form at /login', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Auth, useValue: { validateSession: () => of(true), user: () => null } }, provideHttpClient(), provideHttpClientTesting()] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login', Login);
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    TestBed.inject(HttpTestingController).verify();
  });
  it('shows the detail and permits navigation to edit and back without writes', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Auth, useValue: { validateSession: () => of(true), user: () => null } }, provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const tournament = { id: 5, name: 'Copa de detalle', location: 'Firmat', modality: 'futbol_5', max_teams: 4, rules: 'official_rules_football_5', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };
    await harness.navigateByUrl('/tournaments/5', TournamentDetail);
    http.expectOne('/api/tournaments/5').flush(tournament);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(tournament.name);
    const edit = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/tournaments/5/edit"]');
    expect(edit).toBeTruthy();
    edit?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    http.expectOne('/api/tournaments/5').flush(tournament);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Editar torneo');
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
    await harness.navigateByUrl('/tournaments/5', TournamentDetail);
    http.expectOne('/api/tournaments/5').flush(tournament);
    harness.detectChanges();
    harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/tournaments"]')?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    http.expectOne('/api/tournaments').flush([tournament]);
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/tournaments');
    expect(harness.routeNativeElement?.textContent).toContain('Ver detalle');
    http.verify();
  });

  it('shows a safe 404 at /tournaments/999999/edit without an editable form', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Auth, useValue: { validateSession: () => of(true), user: () => null } }, provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const form = await harness.navigateByUrl('/tournaments/999999/edit', TournamentForm);
    http.expectOne('/api/tournaments/999999').flush({ error: true, message: 'Tournament not found' }, { status: 404, statusText: 'Not Found' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('No se encontró el torneo');
    expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('a')?.getAttribute('href')).toBe('/tournaments');
    form.submit();
    http.expectNone((request) => request.method === 'PUT');
    http.verify();
  });

  it('loads the same form at /tournaments/:id/edit and refreshes the list after PUT', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Auth, useValue: { validateSession: () => of(true), user: () => null } }, provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const form = await harness.navigateByUrl('/tournaments/5/edit', TournamentForm);
    const tournament = { id: 5, name: 'Copa', location: 'Firmat', modality: 'futbol_5', max_teams: 4, rules: 'official_rules_football_5', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };
    http.expectOne('/api/tournaments/5').flush(tournament);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Editar torneo');
    form.form.controls.name.setValue('Copa actualizada');
    form.submit();
    const put = http.expectOne('/api/tournaments/5');
    expect(put.request.method).toBe('PUT');
    const updated = { ...tournament, name: 'Copa actualizada' };
    put.flush(updated);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/tournaments');
    http.expectOne('/api/tournaments').flush([updated]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Copa actualizada');
    http.verify();
  });

  it('loads /tournaments/new and reloads the list with the created tournament after success', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Auth, useValue: { validateSession: () => of(true), user: () => null } }, provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tournaments', TournamentList);
    harness.detectChanges();
    http.expectOne('/api/tournaments').flush([]);
    const form = await harness.navigateByUrl('/tournaments/new', TournamentForm);
    expect(harness.routeNativeElement?.textContent).toContain('Crear torneo');
    form.form.setValue({ name: 'Copa Regional', location: 'Rosario', modality: 'futbol_11', max_teams: 16 });
    form.submit();
    const post = http.expectOne('/api/tournaments');
    expect(post.request.method).toBe('POST');
    const created = { ...post.request.body, id: 8, status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };
    post.flush(created, { status: 201, statusText: 'Created' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/tournaments');
    const get = http.expectOne('/api/tournaments');
    expect(get.request.method).toBe('GET');
    get.flush([created]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Copa Regional');
    http.verify();
  });
});
