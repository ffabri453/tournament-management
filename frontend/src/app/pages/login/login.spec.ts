import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { Auth } from '../../core/services/auth';
import { LoginResponse } from '../../models/auth';

import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let response: Subject<LoginResponse>;
  const login = vi.fn();

  beforeEach(async () => {
    response = new Subject<LoginResponse>();
    login.mockReset().mockReturnValue(response);
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: Auth, useValue: { login } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not send an invalid form and shows validation', () => {
    component.submit();
    fixture.detectChanges();
    expect(login).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Ingresá un email válido');
  });

  it('sends normalized email and exact password, displays loading and prevents duplicate requests', () => {
    component.form.setValue({ email: ' USER@EXAMPLE.COM ', password: ' secret ' });
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(login).toHaveBeenCalledExactlyOnceWith({ email: 'user@example.com', password: ' secret ' });
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Iniciando sesión');
    expect(fixture.nativeElement.querySelector('#password').type).toBe('password');
  });

  it('navigates to tournaments on success and clears the password', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({ email: 'user@example.com', password: 'secret' });
    component.submit();
    response.next({ message: 'Login successful', access_token: `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`, token_type: 'Bearer', expires_in: 3600, data: {
      id: 1, name: 'User', email: 'user@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z',
    } });
    response.complete();
    expect(navigate).toHaveBeenCalledWith('/tournaments');
    expect(component.form.controls.password.value).toBe('');
    expect(component.loading()).toBe(false);
  });

  it.each([
    [401, 'Email o contraseña incorrectos.'],
    [400, 'Revisá el email y la contraseña ingresados.'],
    [0, 'No se pudo conectar con el servidor.'],
    [503, 'No se pudo conectar con el servidor.'],
    [500, 'No se pudo iniciar sesión.'],
  ])('shows a safe error for HTTP %s and permits retry without navigation', (status, message) => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    component.form.setValue({ email: 'user@example.com', password: 'sensitive-secret' });
    component.submit();
    response.error(new HttpErrorResponse({ status, error: { message: 'sensitive-secret' } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(message);
    expect(fixture.nativeElement.textContent).not.toContain('sensitive-secret');
    expect(component.form.controls.password.value).toBe('');
    expect(component.loading()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
