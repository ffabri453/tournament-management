import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, tap, throwError } from 'rxjs';
import { REDIRECT_ON_UNAUTHORIZED } from '../auth.context';
import { AuthenticatedUser, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from '../../models/auth';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly storageKey = 'tournament.accessToken';
  private credential: string | null = this.restoreToken();
  private readonly currentUser = signal<AuthenticatedUser | null>(null);
  readonly user = this.currentUser.asReadonly();

  private restoreToken(): string | null {
    try { return sessionStorage.getItem(this.storageKey); } catch { return null; }
  }

  token(): string | null {
    try {
      if (!this.credential) return null;
      const parts = this.credential.split('.');
      if (parts.length !== 3) throw new Error('Invalid token');
      const payload: unknown = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof payload !== 'object' || payload === null || !('exp' in payload) ||
          typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
        throw new Error('Expired token');
      }
      return this.credential;
    } catch {
      this.clear();
      return null;
    }
  }

  validateSession(redirectOnUnauthorized = true): Observable<boolean> {
    const token = this.token();
    if (!token) return of(false);
    return this.http.get<{ data: AuthenticatedUser }>('/api/auth/me', {
      context: new HttpContext().set(REDIRECT_ON_UNAUTHORIZED, redirectOnUnauthorized),
    }).pipe(map(response => {
      if (this.token() !== token) return false;
      this.currentUser.set(response.data);
      return true;
    }), catchError((error: unknown) => {
      if (redirectOnUnauthorized) return throwError(() => error);
      if (this.token() === token) this.clear();
      return of(false);
    }));
  }

  clear(): void {
    this.credential = null;
    this.currentUser.set(null);
    try { sessionStorage.removeItem(this.storageKey); } catch { /* Storage can be disabled. */ }
  }

  logout(): void {
    this.clear();
    void this.router.navigateByUrl('/login');
  }

  register({ name, email, password }: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>('/api/auth/register', { name, email, password });
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', credentials).pipe(tap(response => {
      this.clear();
      this.credential = response.access_token;
      if (!this.token()) throw new Error('Invalid login credential');
      try { sessionStorage.setItem(this.storageKey, response.access_token); } catch { /* Keep this session in memory. */ }
      this.currentUser.set(response.data);
    }));
  }
}
