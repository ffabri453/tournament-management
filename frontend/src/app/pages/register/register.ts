import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { Auth } from '../../core/services/auth';

const nameValidator: ValidatorFn = control => {
  const name = String(control.value).trim();
  return name.length > 0 && Array.from(name).length <= 100 && !name.includes('\0') &&
    !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(name) ? null : { name: true };
};
const emailValidator: ValidatorFn = control => {
  const email = String(control.value).trim().toLowerCase();
  return Array.from(email).length <= 254 && !/[\x00-\x1f\x7f]/.test(email) &&
    /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) ? null : { email: true };
};
const passwordValidator: ValidatorFn = control => {
  const password = String(control.value);
  return password.trim().length > 0 && Array.from(password).length >= 8 &&
    new TextEncoder().encode(password).length <= 72 && !password.includes('\0') ? null : { password: true };
};
const matchingPasswords: ValidatorFn = control =>
  control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true };

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [nameValidator] }),
    email: new FormControl('', { nonNullable: true, validators: [emailValidator] }),
    password: new FormControl('', { nonNullable: true, validators: [passwordValidator] }),
    confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  }, { validators: matchingPasswords });

  private clearPasswords(): void {
    this.form.controls.password.reset();
    this.form.controls.confirmPassword.reset();
  }

  submit(): void {
    if (this.loading()) return;
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.auth.register({ name: name.trim(), email: email.trim().toLowerCase(), password }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: () => {
        this.clearPasswords();
        void this.router.navigateByUrl('/login').catch(() => {
          this.error.set('La cuenta fue creada. Abrí Iniciar sesión para continuar.');
        });
      },
      error: (failure: unknown) => {
        this.clearPasswords();
        const status = failure instanceof HttpErrorResponse ? failure.status : undefined;
        this.error.set(status === 409 ? 'Ya existe una cuenta con ese email. Iniciá sesión o usá otro email.' :
          status === 400 ? 'Revisá los datos ingresados para crear tu cuenta.' :
          status === 0 || status === 502 || status === 503 || status === 504 ?
            'No se pudo conectar con el servidor. Intentá nuevamente más tarde.' :
            'No se pudo crear la cuenta. Intentá nuevamente más tarde.');
      },
    });
  }
}
