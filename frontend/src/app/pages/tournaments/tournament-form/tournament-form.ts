import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';

const validName: ValidatorFn = (control) => {
  const value: unknown = control.value;
  if (typeof value !== 'string') return { name: true };
  const name = value.trim();
  return name.length > 0 && Array.from(name).length <= 100 && !name.includes('\0') &&
    !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(name)
    ? null : { name: true };
};

const oneOf = (values: readonly unknown[]): ValidatorFn => (control) =>
  values.includes(control.value as unknown) ? null : { option: true };

const rulesByModality: Record<Tournament['modality'], string> = {
  futbol_5: 'official_rules_football_5',
  futbol_7: 'official_rules_football_7',
  futbol_11: 'official_rules_football_11',
};

@Component({
  selector: 'app-tournament-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './tournament-form.html',
  styleUrl: './tournament-form.css',
})
export class TournamentForm {
  private readonly tournamentService = inject(TournamentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly locations: readonly Tournament['location'][] = ['Firmat', 'Venado Tuerto', 'Rosario', 'Elortondo'];
  readonly modalities: readonly Tournament['modality'][] = ['futbol_5', 'futbol_7', 'futbol_11'];
  readonly capacities: readonly Tournament['max_teams'][] = [4, 8, 16, 32];
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, validName] }),
    location: new FormControl<Tournament['location'] | ''>('', { nonNullable: true, validators: [oneOf(this.locations)] }),
    modality: new FormControl<Tournament['modality'] | ''>('', { nonNullable: true, validators: [oneOf(this.modalities)] }),
    max_teams: new FormControl<Tournament['max_teams'] | null>(null, { validators: [oneOf(this.capacities)] }),
  });

  submit(): void {
    if (this.isSaving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { name, location, modality, max_teams } = this.form.getRawValue();
    if (!location || !modality || !max_teams) return;
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.tournamentService.create({
      name: name.trim(), location, modality, max_teams,
      rules: rulesByModality[modality], format: 'knockout',
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { void this.router.navigate(['/tournaments']); },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.errorMessage.set(this.getErrorMessage(error));
      },
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if ([0, 502, 503, 504].includes(error.status)) {
        return 'No se pudo conectar con el servidor. Intentá nuevamente más tarde.';
      }
      if (error.status === 400) return 'Los datos del torneo no son válidos. Revisá el formulario.';
      const body: unknown = error.error;
      if (error.status === 409 && typeof body === 'object' && body !== null &&
          'message' in body && body.message === 'A tournament with the same name already exists in that location') {
        return 'Ya existe un torneo con ese nombre en la localidad elegida.';
      }
    }
    return 'Ocurrió un error inesperado al crear el torneo. Intentá nuevamente.';
  }
}
