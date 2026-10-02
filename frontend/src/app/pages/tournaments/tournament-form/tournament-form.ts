import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { TournamentService } from '../../../core/services/tournament.service';
import { CreateTournamentInput, Tournament } from '../../../models/tournament';

@Component({
  selector: 'app-tournament-form',
  imports: [ReactiveFormsModule],
  templateUrl: './tournament-form.html',
  styleUrl: './tournament-form.css',
})
export class TournamentForm {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tournamentService = inject(TournamentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly locations: readonly Tournament['location'][] = [
    'Firmat',
    'Venado Tuerto',
    'Rosario',
    'Elortondo',
  ];
  protected readonly modalities: readonly Tournament['modality'][] = [
    'futbol_5',
    'futbol_7',
    'futbol_11',
  ];
  protected readonly maxTeamsOptions: readonly Tournament['max_teams'][] = [4, 8, 16, 32];
  protected readonly tournamentForm = this.formBuilder.group({
    name: ['', Validators.required],
    location: this.formBuilder.control<Tournament['location'] | ''>('', Validators.required),
    modality: this.formBuilder.control<Tournament['modality'] | ''>('', Validators.required),
    max_teams: this.formBuilder.control<Tournament['max_teams'] | null>(null, Validators.required),
  });
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  submit(): void {
    if (this.tournamentForm.invalid || this.isLoading()) {
      this.tournamentForm.markAllAsTouched();
      return;
    }

    const value = this.tournamentForm.getRawValue();
    const tournament: CreateTournamentInput = {
      name: value.name,
      location: value.location as Tournament['location'],
      modality: value.modality as Tournament['modality'],
      max_teams: value.max_teams as Tournament['max_teams'],
    };

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.tournamentService.create(tournament).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false)),
    ).subscribe({
      next: () => void this.router.navigate(['/tournaments']),
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(error.status === 0
          ? 'No se pudo conectar con el servidor.'
          : 'No se pudo crear el torneo.');
      },
    });
  }

  cancel(): void {
    void this.router.navigate(['/tournaments']);
  }
}
