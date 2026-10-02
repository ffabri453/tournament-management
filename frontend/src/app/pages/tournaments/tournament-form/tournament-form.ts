import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap } from 'rxjs';
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
export class TournamentForm implements OnInit {
  private readonly tournamentService = inject(TournamentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private tournamentId: number | null = null;
  readonly isEditing = signal(false);
  readonly isLoading = signal(false);
  readonly loadFailed = signal(false);
  readonly structureLocked = signal(false);
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

  ngOnInit(): void {
    this.route.paramMap.pipe(
      switchMap((params) => {
        const rawId = params.get('id');
        this.isEditing.set(rawId !== null);
        this.tournamentId = null;
        this.isLoading.set(false);
        this.loadFailed.set(false);
        this.structureLocked.set(false);
        this.errorMessage.set('');
        this.form.enable();
        this.form.reset();
        if (rawId === null) return EMPTY;
        const id = Number(rawId);
        if (!/^\d+$/.test(rawId) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
          this.loadFailed.set(true);
          this.errorMessage.set('El identificador del torneo no es válido.');
          return EMPTY;
        }
        this.isLoading.set(true);
        return this.tournamentService.getById(id).pipe(
          catchError((error: unknown) => {
            this.isLoading.set(false);
            this.loadFailed.set(true);
            this.errorMessage.set(this.getErrorMessage(error, true));
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((tournament) => {
      this.tournamentId = tournament.id;
      this.form.setValue({ name: tournament.name, location: tournament.location,
        modality: tournament.modality, max_teams: tournament.max_teams });
      this.structureLocked.set(tournament.status !== 'open');
      if (this.structureLocked()) {
        this.form.controls.location.disable();
        this.form.controls.modality.disable();
        this.form.controls.max_teams.disable();
      }
      this.isLoading.set(false);
    });
  }

  submit(): void {
    if (this.isSaving() || this.isLoading() || this.loadFailed() ||
        (this.isEditing() && this.tournamentId === null)) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { name, location, modality, max_teams } = this.form.getRawValue();
    if (!location || !modality || !max_teams) return;
    this.isSaving.set(true);
    this.errorMessage.set('');
    const request = this.isEditing() && this.tournamentId !== null
      ? this.tournamentService.update(this.tournamentId, this.structureLocked()
          ? { name: name.trim() }
          : { name: name.trim(), location, modality, max_teams, format: 'knockout' })
      : this.tournamentService.create({
      name: name.trim(), location, modality, max_teams,
      rules: rulesByModality[modality], format: 'knockout',
      });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { void this.router.navigate(['/tournaments']); },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.errorMessage.set(this.getErrorMessage(error));
      },
    });
  }

  private getErrorMessage(error: unknown, loading = false): string {
    if (error instanceof HttpErrorResponse) {
      if (this.isEditing() && error.status === 404) return 'No se encontró el torneo. Volvé al listado de torneos.';
      if ([0, 502, 503, 504].includes(error.status)) {
        return 'No se pudo conectar con el servidor. Intentá nuevamente más tarde.';
      }
      if (error.status === 400) return 'Los datos del torneo no son válidos. Revisá el formulario.';
      const body: unknown = error.error;
      if (error.status === 409 && typeof body === 'object' && body !== null &&
          'message' in body && body.message === 'A tournament with the same name already exists in that location') {
        return 'Ya existe un torneo con ese nombre en la localidad elegida.';
      }
      if (this.isEditing() && error.status === 409) {
        return 'No se pueden guardar esos cambios por el estado del torneo o sus equipos registrados. Revisá la capacidad y la modalidad.';
      }
    }
    if (this.isEditing()) return loading
      ? 'No se pudo cargar el torneo. Volvé al listado e intentá nuevamente.'
      : 'Ocurrió un error inesperado al actualizar el torneo. Intentá nuevamente.';
    return 'Ocurrió un error inesperado al crear el torneo. Intentá nuevamente.';
  }
}
