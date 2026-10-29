import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AuthenticatedUser } from './models/auth';
import { Auth } from './core/services/auth';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App routing', () => {
  const user = signal<AuthenticatedUser | null>(null);
  beforeEach(async () => {
    user.set(null);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: Auth, useValue: { validateSession: () => of(user() !== null), user } }, provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  for (const url of ['/tournaments']) {
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
      expect(element.querySelector('h1')?.textContent).toBe('Torneos creados');
      expect(element.textContent).toContain('No hay torneos registrados.');
      http.verify();
    });
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function openHome() {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('opens the public home without API calls or a loading indicator', async () => {
    const { element } = await openHome();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(element.querySelector('h1')?.textContent).toContain('Nada es lo mismo');
    expect(element.querySelector('app-loading')).toBeNull();
    expect(element.querySelector('app-home a.create')?.getAttribute('href')).toBe('/login?returnUrl=%2Ftournaments%2Fnew');
    expect(element.querySelector('app-home a.browse')?.getAttribute('href')).toBe('/tournaments');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('takes a visitor from Crear torneo to login with the return destination', async () => {
    const { fixture, element } = await openHome();
    element.querySelector<HTMLAnchorElement>('app-home a.create')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Ftournaments%2Fnew');
    expect(element.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(element.querySelector('a[href="/register"]')).not.toBeNull();
  });

  it('takes a signed-in organizer to the protected creation form', async () => {
    user.set({ id: 1, name: 'Owner', email: 'owner@example.test', role: 'organizer', created_at: '2026-01-01' });
    const { fixture, element } = await openHome();
    expect(element.querySelector('.session-link')?.textContent).toContain('Cerrar sesión');
    element.querySelector<HTMLAnchorElement>('app-home a.create')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/tournaments/new');
    expect(element.querySelector('h1')?.textContent).toBe('Crear torneo');
  });

  it('shows the ball loader only during the actual tournament request', async () => {
    const { fixture, element } = await openHome();
    element.querySelector<HTMLAnchorElement>('app-home a.browse')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/tournaments');
    expect(element.querySelector('app-loading [role="status"]')?.textContent).toContain('Cargando torneos');
    TestBed.inject(HttpTestingController).expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    expect(element.querySelector('app-loading')).toBeNull();
    expect(element.textContent).toContain('No hay torneos registrados.');
  });

  it('removes the loader on failure and lets the visitor retry', async () => {
    const { fixture, element } = await openHome();
    await TestBed.inject(Router).navigateByUrl('/tournaments');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/tournaments').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('app-loading')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar');
    element.querySelector<HTMLButtonElement>('app-tournament-list .error button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-loading')).not.toBeNull();
    http.expectOne('/api/tournaments').flush([]);
    fixture.detectChanges();
    expect(element.querySelector('app-loading')).toBeNull();
  });
});
