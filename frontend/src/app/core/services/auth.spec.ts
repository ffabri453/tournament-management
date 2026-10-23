import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LoginResponse, RegisterResponse } from '../../models/auth';

import { Auth } from './auth';

describe('Auth', () => {
  let service: Auth;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(Auth);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('posts only registration fields and receives a typed response without starting a session', () => {
    const input = { name: 'User', email: 'user@example.com', password: ' password ', confirmPassword: ' password ', role: 'admin' };
    const response: RegisterResponse = { message: 'User registered successfully', data: {
      id: 1, name: 'User', email: input.email, role: 'organizer', created_at: '2026-01-01T00:00:00Z',
    } };
    const received = vi.fn();
    service.register(input).subscribe(received);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/register');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: input.name, email: input.email, password: input.password });
    request.flush(response, { status: 201, statusText: 'Created' });
    expect(received).toHaveBeenCalledWith(response);
    expect(service.user()).toBeNull();
    expect(service.token()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('propagates registration errors', () => {
    const failed = vi.fn();
    service.register({ name: 'User', email: 'user@example.com', password: 'password' }).subscribe({ error: failed });
    TestBed.inject(HttpTestingController).expectOne('/api/auth/register').flush(
      { error: true, message: 'A user with this email already exists' }, { status: 409, statusText: 'Conflict' },
    );
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });

  afterEach(() => { sessionStorage.clear(); TestBed.inject(HttpTestingController).verify(); });

  it('posts the exact credentials through the proxy and receives the public user', () => {
    const credentials = { email: 'user@example.com', password: ' secret ' };
    const response: LoginResponse = { message: 'Login successful', access_token: `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`, token_type: 'Bearer', expires_in: 3600, data: {
      id: 1, name: 'User', email: credentials.email, role: 'organizer', created_at: '2026-01-01T00:00:00.000Z',
    } };
    const received = vi.fn();
    service.login(credentials).subscribe(received);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(credentials);
    request.flush(response);
    expect(received).toHaveBeenCalledWith(response);
  });

  it('propagates backend errors', () => {
    const failed = vi.fn();
    service.login({ email: 'user@example.com', password: 'wrong' }).subscribe({ error: failed });
    TestBed.inject(HttpTestingController).expectOne('/api/auth/login').flush(
      { error: true, message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' },
    );
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });
});
