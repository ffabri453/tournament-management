import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, EMPTY, finalize, map, startWith, Subject, switchMap } from 'rxjs';
import { TeamService } from '../../../core/services/team';
import { TournamentService } from '../../../core/services/tournament.service';
import { Team } from '../../../models/team';
import { Tournament } from '../../../models/tournament';

@Component({
  selector: 'app-team-list',
  imports: [RouterLink],
  templateUrl: './team-list.html',
  styleUrl: './team-list.css',
})
export class TeamList implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly teamService = inject(TeamService);
  private readonly tournamentService = inject(TournamentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = new Subject<void>();

  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly teams = signal<Team[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly canRetry = signal(false);
  protected readonly canAdd = computed(() => {
    const tournament = this.tournament();
    return tournament !== null && tournament.status === 'open' && this.teams().length < tournament.max_teams;
  });

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.reload.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        this.tournament.set(null);
        this.teams.set([]);
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
          switchMap(tournament => this.teamService.getByTournamentId(id).pipe(
            map(teams => ({ tournament, teams })),
          )),
          catchError((error: unknown) => {
            const status = error instanceof HttpErrorResponse ? error.status : null;
            this.canRetry.set(status !== 400 && status !== 404);
            this.errorMessage.set(status === 404 ? 'No se encontr\u00f3 el torneo.' :
              status === 400 ? 'El identificador del torneo no es v\u00e1lido.' :
              status !== null && [0, 502, 503, 504].includes(status)
                ? 'No se pudo conectar con el servidor. Intent\u00e1 nuevamente.'
                : 'No se pudieron cargar los equipos. Intent\u00e1 nuevamente.');
            return EMPTY;
          }),
          finalize(() => this.isLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ tournament, teams }) => {
      this.tournament.set(tournament);
      this.teams.set(teams);
    });
  }

  protected retry(): void {
    if (this.canRetry() && !this.isLoading()) this.reload.next();
  }
}
