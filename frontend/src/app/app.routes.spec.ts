import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { TournamentForm } from './pages/tournaments/tournament-form/tournament-form';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';

describe('Tournament creation routing', () => {
  it('loads /tournaments/new and reloads the list with the created tournament after success', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
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
