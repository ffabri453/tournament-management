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
  protected readonly deletingIds = signal<ReadonlySet<number>>(new Set());
  protected readonly deleteErrors = signal<ReadonlyMap<number, string>>(new Map());
  private reloadAfterLoad = false;
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
      finalize(() => {
        this.isLoading.set(false);
        if (this.reloadAfterLoad && !this.destroyRef.destroyed) {
          this.reloadAfterLoad = false;
          this.loadTournaments();
        }
      }),
    ).subscribe({
      next: (tournaments) => this.tournaments.set(tournaments),
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(error.status === 0
          ? 'No se pudo conectar con el servidor.'
          : 'No se pudieron cargar los torneos.');
      },
    });
  }

  protected deleteTournament(tournament: Tournament): void {
    if (this.deletingIds().has(tournament.id) || tournament.status !== 'open') return;
    if (!window.confirm(`¿Seguro que querés eliminar "${tournament.name}"? También se eliminarán sus equipos y partidos asociados.`)) return;

    this.deletingIds.update((ids) => new Set(ids).add(tournament.id));
    this.deleteErrors.update((errors) => {
      const updated = new Map(errors);
      updated.delete(tournament.id);
      return updated;
    });
    this.tournamentService.delete(tournament.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.deletingIds.update((ids) => {
        const updated = new Set(ids);
        updated.delete(tournament.id);
        return updated;
      })),
    ).subscribe({
      next: () => {
        if (this.isLoading()) this.reloadAfterLoad = true;
        else this.loadTournaments();
      },
      error: (error: unknown) => {
        this.deleteErrors.update((errors) => new Map(errors).set(tournament.id, this.getDeleteError(error)));
      },
    });
  }

  private getDeleteError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if ([0, 502, 503, 504].includes(error.status)) return 'No se pudo conectar con el servidor. Intentá nuevamente más tarde.';
      if (error.status === 400) return 'No se pudo eliminar el torneo porque sus datos no son válidos. Actualizá el listado e intentá nuevamente.';
      if (error.status === 404) return 'El torneo ya no existe. Actualizá el listado para consultar los torneos disponibles.';
      if (error.status === 409) return 'No se puede eliminar un torneo iniciado o con partidos finalizados.';
    }
    return 'Ocurrió un error inesperado al eliminar el torneo. Intentá nuevamente.';
  }
}
