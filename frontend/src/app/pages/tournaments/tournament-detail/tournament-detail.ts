import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, EMPTY, finalize, startWith, Subject, switchMap } from 'rxjs';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';

@Component({
  selector: 'app-tournament-detail',
  imports: [DatePipe, RouterLink],
  templateUrl: './tournament-detail.html',
  styleUrl: './tournament-detail.css',
})
export class TournamentDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tournamentService = inject(TournamentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = new Subject<void>();

  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly canRetry = signal(false);
  protected readonly statusLabels: Record<Tournament['status'], string> = {
    open: 'Abierto', in_progress: 'En curso', finished: 'Finalizado',
  };
  protected readonly modalityLabels: Record<Tournament['modality'], string> = {
    futbol_5: 'F\u00fatbol 5', futbol_7: 'F\u00fatbol 7', futbol_11: 'F\u00fatbol 11',
  };
  protected readonly ruleLabels: Partial<Record<string, string>> = {
    official_rules_football_5: 'Reglamento oficial de f\u00fatbol 5',
    official_rules_football_7: 'Reglamento oficial de f\u00fatbol 7',
    official_rules_football_11: 'Reglamento oficial de f\u00fatbol 11',
  };

  ngOnInit(): void {
    // Un cambio de ID o un reintento cancela la consulta anterior.
    combineLatest([this.route.paramMap, this.reload.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        this.tournament.set(null);
        this.errorMessage.set('');
        this.canRetry.set(false);
        const rawId = params.get('id');
        const id = Number(rawId);
        if (rawId === null || !/^\d+$/.test(rawId) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
          this.errorMessage.set('El identificador del torneo no es v\u00e1lido.');
          return EMPTY;
        }

        this.isLoading.set(true);
        return this.tournamentService.getById(id).pipe(
          catchError((error: unknown) => {
            this.setError(error);
            return EMPTY;
          }),
          finalize(() => this.isLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((tournament) => this.tournament.set(tournament));
  }

  protected retry(): void {
    if (this.canRetry() && !this.isLoading()) this.reload.next();
  }

  private setError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        this.errorMessage.set('No se encontr\u00f3 el torneo. Volv\u00e9 al listado de torneos.');
        return;
      }
      if (error.status === 400) {
        this.errorMessage.set('El identificador del torneo no es v\u00e1lido.');
        return;
      }
      if ([0, 502, 503, 504].includes(error.status)) {
        this.errorMessage.set('No se pudo conectar con el servidor. Intent\u00e1 nuevamente m\u00e1s tarde.');
        this.canRetry.set(true);
        return;
      }
    }
    this.errorMessage.set('Ocurri\u00f3 un error inesperado al cargar el torneo. Intent\u00e1 nuevamente.');
    this.canRetry.set(true);
  }
}
