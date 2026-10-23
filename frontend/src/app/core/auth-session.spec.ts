import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { Login } from '../pages/login/login';
import { TournamentForm } from '../pages/tournaments/tournament-form/tournament-form';
import { Auth } from './services/auth';
import { authInterceptor } from './auth.interceptor';

const storageKey = 'tournament.accessToken';
const token = (exp = Math.floor(Date.now() / 1000) + 3600) =>
  `e30.${btoa(JSON.stringify({ sub: '1', exp }))}.signature`;
const user = { id: 1, name: 'User', email: 'user@example.com', role: 'organizer' as const, created_at: '2026-01-01' };

describe('Persistent authentication', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes),
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  it('login retains only the credential and logout clears state and navigates to login', () => {
    const auth = TestBed.inject(Auth);
    const http = TestBed.inject(HttpTestingController);
    const credential = token();
    auth.login({ email: user.email, password: 'secret' }).subscribe();
    const login = http.expectOne('/api/auth/login');
    expect(login.request.headers.has('Authorization')).toBe(false);
    login.flush({ access_token: credential, token_type: 'Bearer', expires_in: 3600, data: user, message: 'Login successful' });
    expect(auth.token()).toBe(credential);
    expect(auth.user()).toEqual(user);
    expect(sessionStorage.getItem(storageKey)).toBe(credential);
    expect(JSON.stringify(sessionStorage)).not.toContain('secret');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    auth.logout();
    expect(auth.token()).toBeNull();
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('restores the credential after reload but obtains the user from the server', () => {
    const credential = token();
    sessionStorage.setItem(storageKey, credential);
    const auth = TestBed.inject(Auth);
    expect(auth.user()).toBeNull();
    const valid = vi.fn();
    auth.validateSession().subscribe(valid);
    const me = TestBed.inject(HttpTestingController).expectOne('/api/auth/me');
    expect(me.request.headers.get('Authorization')).toBe(`Bearer ${credential}`);
    me.flush({ data: user });
    expect(valid).toHaveBeenCalledWith(true);
    expect(auth.user()).toEqual(user);
  });

  it.each(['broken', token(1)])('discards malformed or expired credentials: %s', credential => {
    sessionStorage.setItem(storageKey, credential);
    const auth = TestBed.inject(Auth);
    expect(auth.token()).toBeNull();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    const valid = vi.fn();
    auth.validateSession().subscribe(valid);
    expect(valid).toHaveBeenCalledWith(false);
  });

  it('adds Bearer only to the application API paths and clears the session on protected 401', () => {
    const credential = token();
    sessionStorage.setItem(storageKey, credential);
    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);
    for (const path of ['/api/tournaments', '/api/teams/1', '/api/teams/1/logo', '/api/matches?x=1', '/api/auth/me']) {
      client.get(path).subscribe();
      const request = http.expectOne(path);
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${credential}`);
      request.flush({});
    }
    for (const path of ['/api/auth/login', '/api/auth/register', '/assets/icon.svg', '/api/tournaments-other',
      'https://other.example/api/tournaments', '//other.example/api/teams']) {
      client.get(path).subscribe();
      const request = http.expectOne(path);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    client.put('/api/tournaments/1', {}).subscribe({ error: () => undefined });
    http.expectOne('/api/tournaments/1').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(TestBed.inject(Auth).token()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('redirects direct unauthenticated access and leaves login public', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/tournaments/new', Login);
    expect(TestBed.inject(Router).url).toBe('/login');
    await harness.navigateByUrl('/login', Login);
  });

  it('allows server-verified access, survives reload, and blocks access after logout', async () => {
    sessionStorage.setItem(storageKey, token());
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/tournaments/new', TournamentForm);
    await vi.waitFor(() => http.expectOne('/api/auth/me').flush({ data: user }));
    await navigation;
    TestBed.inject(Auth).logout();
    await harness.fixture.whenStable();
    await harness.navigateByUrl('/tournaments/new', Login);
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('rejects a locally plausible credential when the backend rejects its signature', async () => {
    sessionStorage.setItem(storageKey, token());
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/tournaments/new');
    await vi.waitFor(() => http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' }));
    await navigation;
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
});
