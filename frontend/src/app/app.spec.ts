import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App routing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  for (const url of ['/', '/tournaments']) {
    it(`renders TournamentList through RouterOutlet from ${url}`, async () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      await router.navigateByUrl(url);
      fixture.detectChanges();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('/api/tournaments').flush([]);
      fixture.detectChanges();
      expect(router.url).toBe('/tournaments');
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('h1')?.textContent).toBe('Torneos');
      expect(element.textContent).toContain('No hay torneos registrados.');
      http.verify();
    });
  }

  it('renders TournamentForm at /tournaments/new', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/tournaments/new');
    fixture.detectChanges();

    expect(router.url).toBe('/tournaments/new');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toBe('Crear torneo');
    expect(element.querySelector('form')).not.toBeNull();
  });
});
