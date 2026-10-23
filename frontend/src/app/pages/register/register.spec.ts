import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { Auth } from '../../core/services/auth';
import { RegisterResponse } from '../../models/auth';
import { routes } from '../../app.routes';
import { Login } from '../login/login';
import { Register } from './register';

const valid = { name: ' User ', email: ' USER@EXAMPLE.COM ', password: ' password ', confirmPassword: ' password ' };
const created: RegisterResponse = { message: 'User registered successfully', data: {
  id: 1, name: 'User', email: 'user@example.com', role: 'organizer', created_at: '2026-01-01T00:00:00Z',
} };

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;
  let response: Subject<RegisterResponse>;
  const register = vi.fn();

  beforeEach(async () => {
    response = new Subject<RegisterResponse>();
    register.mockReset().mockReturnValue(response);
    await TestBed.configureTestingModule({ imports: [Register], providers: [
      provideRouter(routes), { provide: Auth, useValue: { register } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('creates the component', () => expect(component).toBeTruthy());

  it.each([
    {}, { email: 'invalid' }, { email: 'a@example..com' }, { email: 'a\0@example.com' },
    { email: `${'a'.repeat(243)}@example.com` }, { name: '   ' }, { name: '1e3' },
    { name: 'a'.repeat(101) }, { name: 'User\0' }, { password: 'short', confirmPassword: 'short' },
    { password: '🔒'.repeat(7), confirmPassword: '🔒'.repeat(7) },
    { password: 'é'.repeat(37), confirmPassword: 'é'.repeat(37) },
    { password: 'a'.repeat(73), confirmPassword: 'a'.repeat(73) },
    { password: '        ', confirmPassword: '        ' },
    { password: 'abcdefgh\0', confirmPassword: 'abcdefgh\0' }, { confirmPassword: '' }, { confirmPassword: 'different' },
  ])('does not send invalid registration: %j', overrides => {
    if (Object.keys(overrides).length) component.form.setValue({ ...valid, ...overrides });
    component.submit();
    fixture.detectChanges();
    expect(register).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.error')).toBeTruthy();
  });

  it.each(['abcdefgh', 'a'.repeat(72), 'é'.repeat(36), '🔒'.repeat(8)])('accepts password boundary %s', password => {
    component.form.setValue({ ...valid, password, confirmPassword: password });
    component.submit();
    expect(register).toHaveBeenCalledWith({ name: 'User', email: 'user@example.com', password });
  });

  it('sends only normalized public fields, shows loading and prevents double submission', () => {
    component.form.setValue(valid);
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(register).toHaveBeenCalledExactlyOnceWith({ name: 'User', email: 'user@example.com', password: ' password ' });
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Creando cuenta');
    expect(fixture.nativeElement.querySelector('form').getAttribute('aria-busy')).toBe('true');
  });

  it('navigates to login on success and clears both passwords', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue(valid);
    component.submit();
    response.next(created);
    response.complete();
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(component.form.controls.password.value).toBe('');
    expect(component.form.controls.confirmPassword.value).toBe('');
    expect(component.loading()).toBe(false);
  });

  it.each([
    [409, 'Ya existe una cuenta con ese email.'], [400, 'Revisá los datos ingresados'],
    [0, 'No se pudo conectar con el servidor.'], [502, 'No se pudo conectar con el servidor.'],
    [503, 'No se pudo conectar con el servidor.'], [504, 'No se pudo conectar con el servidor.'],
    [500, 'No se pudo crear la cuenta.'],
  ])('handles HTTP %s safely and permits retry', (status, message) => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    component.form.setValue(valid);
    component.submit();
    response.error(new HttpErrorResponse({ status, error: { message: 'Sensitive SQL password' } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(message);
    expect(fixture.nativeElement.textContent).not.toContain('Sensitive SQL password');
    expect(component.form.controls.password.value).toBe('');
    expect(component.form.controls.confirmPassword.value).toBe('');
    expect(component.loading()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('handles non-HTTP errors safely', () => {
    component.form.setValue(valid);
    component.submit();
    response.error(new Error('Sensitive details'));
    expect(component.error()).toContain('No se pudo crear la cuenta.');
    expect(component.loading()).toBe(false);
  });

  it('loads public register and follows both router links without session validation', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/register', Register);
    harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/login"]')?.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(Login);
    harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/register"]')?.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/register');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(Register);
  });
});
