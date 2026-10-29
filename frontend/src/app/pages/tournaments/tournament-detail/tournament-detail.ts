import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, EMPTY, finalize, startWith, Subject, Subscription, switchMap } from 'rxjs';
import { TeamService } from '../../../core/services/team';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';
import { canManageTournament } from '../../../core/tournament-access';
import { Auth } from '../../../core/services/auth';
import { Loading } from '../../../shared/loading';

const futureMatchDate: ValidatorFn = control => {
  const value: unknown = control.value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || value.startsWith('0000')) {
    return { matchDate: true };
  }
  // El backend interpreta la fecha sin zona horaria como hora de Argentina.
  const timestamp = Date.parse(`${value}:00-03:00`);
  const sameDate = Number.isFinite(timestamp) &&
    new Date(timestamp - 3 * 60 * 60 * 1000).toISOString().slice(0, 16) === value;
  return sameDate && timestamp > Date.now() ? null : { matchDate: true };
};

@Component({
  selector: 'app-tournament-detail',
  imports: [DatePipe, RouterLink, ReactiveFormsModule, Loading],
  templateUrl: './tournament-detail.html',
  styleUrl: './tournament-detail.css',
})
export class TournamentDetail implements OnInit {
  protected readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly tournamentService = inject(TournamentService);
  private readonly teamService = inject(TeamService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = new Subject<void>();
  private startSubscription?: Subscription;
  private championSubscription?: Subscription;

  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly canRetry = signal(false);
  protected readonly isStarting = signal(false);
  protected readonly startError = signal('');
  protected readonly startSuccess = signal('');
  protected readonly needsRefresh = signal(false);
  protected readonly championName = signal('');
  protected readonly isChampionLoading = signal(false);
  protected readonly championError = signal('');
  readonly matchDate = new FormControl('', { nonNullable: true, validators: [Validators.required, futureMatchDate] });
  readonly startForm = new FormGroup({ match_date: this.matchDate });
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
        this.startSubscription?.unsubscribe();
        this.championSubscription?.unsubscribe();
        this.startError.set('');
        this.startSuccess.set('');
        this.needsRefresh.set(false);
        this.matchDate.reset();
        this.tournament.set(null);
        this.errorMessage.set('');
        this.canRetry.set(false);
        this.championName.set('');
        this.isChampionLoading.set(false);
        this.championError.set('');
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
    ).subscribe((tournament) => {
      this.tournament.set(tournament);
      this.loadChampion(tournament);
    });
  }

  protected retry(): void {
    if (this.canRetry() && !this.isLoading()) this.reload.next();
  }

  protected refreshTournament(): void {
    if (!this.isStarting() && !this.isLoading()) this.reload.next();
  }

  protected startTournament(): void {
    if (!this.canManage()) return;
    const tournament = this.tournament();
    if (!tournament || tournament.status !== 'open' || this.isStarting() || this.isLoading() || this.needsRefresh()) return;
    this.matchDate.markAsTouched();
    this.matchDate.updateValueAndValidity();
    if (this.matchDate.invalid) return;
    if (!window.confirm(`\u00bfIniciar "${tournament.name}"? Se generar\u00e1n ${tournament.max_teams / 2} partidos de la primera ronda y ya no se podr\u00e1n agregar equipos.`)) return;
    // La fecha puede haber vencido mientras estaba abierta la confirmacion.
    this.matchDate.updateValueAndValidity();
    if (this.matchDate.invalid) return;
    this.isStarting.set(true);
    this.startError.set('');
    this.startSuccess.set('');
    this.startSubscription = this.tournamentService.start(tournament.id, {
      match_date: this.matchDate.value.replace('T', ' '),
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isStarting.set(false)),
    ).subscribe({
      next: updatedTournament => {
        this.tournament.set(updatedTournament);
        this.loadChampion(updatedTournament);
        this.startSuccess.set('Torneo iniciado. Se generaron los partidos de la primera ronda.');
      },
      error: (error: unknown) => this.setStartError(error),
    });
  }

  protected canManage(): boolean {
    return canManageTournament(this.auth.user(), this.tournament());
  }

  private loadChampion(tournament: Tournament): void {
    this.championSubscription?.unsubscribe();
    this.championName.set('');
    this.championError.set('');
    this.isChampionLoading.set(false);
    if (tournament.status !== 'finished' || tournament.champion_team_id === null) return;

    this.isChampionLoading.set(true);
    this.championSubscription = this.teamService.getById(tournament.champion_team_id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isChampionLoading.set(false)),
    ).subscribe({
      next: team => {
        if (team.tournament_id !== tournament.id || team.name.trim() === '') {
          this.championError.set('No se pudo recuperar el nombre del equipo campe\u00f3n.');
          return;
        }
        this.championName.set(team.name);
      },
      error: () => this.championError.set('No se pudo recuperar el nombre del equipo campe\u00f3n.'),
    });
  }

  private setStartError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) {
        this.startError.set('No tenés permiso para gestionar este torneo.');
        return;
      }
      const body: unknown = error.error;
      const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
        ? body.message : '';
      if (error.status === 404) {
        this.tournament.set(null);
        this.setError(error);
        return;
      }
      if (error.status === 400) {
        const counts = /^Tournament requires exactly (\d+) teams and has (\d+)$/.exec(message);
        if (counts) {
          this.startError.set(`El torneo necesita exactamente ${counts[1]} equipos y tiene ${counts[2]}. Revis\u00e1 los equipos registrados.`);
        } else if (message === 'Invalid tournament start data') {
          this.startError.set('La fecha de la primera ronda no es v\u00e1lida. Eleg\u00ed una fecha y hora futuras de Argentina.');
        } else if (/^Team \d+ is not valid for this tournament$/.test(message) || message === 'Tournament teams must be unique') {
          this.startError.set('Hay equipos no v\u00e1lidos o duplicados. Revis\u00e1 sus nombres y la cantidad de jugadores de cada equipo.');
        } else {
          this.startError.set('No se puede iniciar con la configuraci\u00f3n actual. Revis\u00e1 los datos del torneo y sus equipos.');
        }
        return;
      }
      if (error.status === 409) {
        this.needsRefresh.set(true);
        this.startError.set(message === 'Tournament cannot start from status in_progress'
          ? 'El torneo ya fue iniciado. Actualiz\u00e1 sus datos.'
          : message === 'Tournament cannot start from status finished'
            ? 'El torneo ya est\u00e1 finalizado. Actualiz\u00e1 sus datos.'
            : message === 'Tournament already has registered matches'
              ? 'El torneo ya tiene partidos registrados y no se puede iniciar de nuevo.'
              : 'El estado del torneo cambi\u00f3. Actualiz\u00e1 sus datos antes de continuar.');
        return;
      }
    }
    // Una respuesta perdida no permite saber si el servidor llego a iniciar el torneo.
    this.needsRefresh.set(true);
    this.startError.set('No se pudo confirmar el inicio. Actualiz\u00e1 el torneo para comprobar su estado antes de intentar nuevamente.');
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
