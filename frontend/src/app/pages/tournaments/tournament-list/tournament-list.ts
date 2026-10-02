import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { RouterLink } from '@angular/router';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';

@Component({
  selector: 'app-tournament-list',
  imports: [RouterLink],
  templateUrl: './tournament-list.html',
  styleUrl: './tournament-list.css',
})
export class TournamentList implements OnInit {
  private readonly tournamentService = inject(TournamentService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly statusLabels: Record<Tournament['status'], string> = {
    open: 'Abierto',
    in_progress: 'En curso',
    finished: 'Finalizado',
  };
  protected readonly modalityLabels: Record<Tournament['modality'], string> = {
    futbol_5: 'Futbol 5',
    futbol_7: 'Futbol 7',
    futbol_11: 'Futbol 11',
  };

  ngOnInit(): void {
    this.loadTournaments();
  }

  protected loadTournaments(): void {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.tournamentService.getAll().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false)),
    ).subscribe({
      next: (tournaments) => this.tournaments.set(tournaments),
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(error.status === 0
          ? 'No se pudo conectar con el servidor.'
          : 'No se pudieron cargar los torneos.');
      },
    });
  }
}
