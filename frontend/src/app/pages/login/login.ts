import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { Auth } from '../../core/services/auth';

const backendEmail: ValidatorFn = (control) => {
  const email = String(control.value).trim().toLowerCase();
  return Array.from(email).length <= 254 && !/[\x00-\x1f\x7f]/.test(email) &&
    /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) ? null : { email: true };
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [backendEmail] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  submit(): void {
    if (this.loading()) return;
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.auth.login({ email: email.trim().toLowerCase(), password }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: () => {
        this.form.controls.password.reset();
        void this.router.navigateByUrl('/tournaments').catch(() => {
          this.error.set('No se pudo abrir la lista de torneos. Intentá nuevamente.');
        });
      },
      error: (failure: unknown) => {
        this.form.controls.password.reset();
        const status = failure instanceof HttpErrorResponse ? failure.status : undefined;
        this.error.set(status === 401 ? 'Email o contraseña incorrectos.' :
          status === 400 ? 'Revisá el email y la contraseña ingresados.' :
          status === 0 || status === 502 || status === 503 || status === 504 ?
            'No se pudo conectar con el servidor. Intentá nuevamente más tarde.' :
            'No se pudo iniciar sesión. Intentá nuevamente más tarde.');
      },
    });
  }
}
