import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, EMPTY, finalize, map, startWith, Subject, Subscription, switchMap } from 'rxjs';
import { MatchService } from '../../../core/services/match';
import { TournamentService } from '../../../core/services/tournament.service';
import { Match, UpdateMatchRequest } from '../../../models/match';
import { BracketMatch, TournamentBracket } from '../../../models/tournament';
import { Bracket } from '../../bracket/bracket';
import { canManageTournament } from '../../../core/tournament-access';
import { Auth } from '../../../core/services/auth';
import { Loading } from '../../../shared/loading';

@Component({
  selector: 'app-match-list',
  imports: [Bracket, DatePipe, ReactiveFormsModule, RouterLink, Loading],
  templateUrl: './match-list.html',
  styleUrl: './match-list.css',
})
export class MatchList implements OnInit {
  protected readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly matchService = inject(MatchService);
  private readonly tournamentService = inject(TournamentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = new Subject<void>();
  private saveSubscription?: Subscription;
  private roundSubscription?: Subscription;

  protected readonly bracket = signal<TournamentBracket | null>(null);
  protected readonly tournament = computed(() => this.bracket()?.tournament ?? null);
  protected readonly matches = computed<BracketMatch[]>(() =>
    this.bracket()?.rounds.flatMap(round => round.matches) ?? []);
  protected readonly activeView = signal<'matches' | 'bracket'>(
    this.route.snapshot?.routeConfig?.path?.endsWith('/bracket') ? 'bracket' : 'matches');
  protected readonly selectedRound = signal<Match['round'] | null>(null);
  protected readonly visibleMatches = computed(() => this.matches().filter(match =>
    this.selectedRound() === null || match.round === this.selectedRound()));
  protected readonly tournamentStatusLabels = { open: 'Abierto', in_progress: 'En progreso', finished: 'Finalizado' };
  protected readonly currentRound = computed(() => {
    const rounds = this.bracket()?.rounds ?? [];
    return rounds.length > 0 ? rounds[rounds.length - 1]! : null;
  });
  protected readonly nextRound = computed<Match['round'] | null>(() => {
    const round = this.currentRound()?.round;
    return round ? nextRoundByRound[round] : null;
  });
  protected readonly canGenerateNextRound = computed(() => {
    const tournament = this.tournament();
    const currentRound = this.currentRound();
    return this.canManage() && tournament?.status === 'in_progress' && this.nextRound() !== null &&
      currentRound !== null && currentRound.matches.length > 0 &&
      currentRound.matches.every(match => match.status === 'finished' && match.winner_team_id !== null);
  });
  private readonly teamNames = computed(() => {
    const names = new Map<number, string>();
    for (const match of this.matches()) {
      if (match.home_team) names.set(match.home_team.id, match.home_team.name);
      if (match.away_team) names.set(match.away_team.id, match.away_team.name);
    }
    return names;
  });
  protected readonly selectedMatchId = signal<number | null>(null);
  protected readonly selectedMatch = computed(() =>
    this.matches().find(match => match.id === this.selectedMatchId()) ?? null);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly canRetry = signal(false);
  protected readonly editingMatchId = signal<number | null>(null);
  protected readonly savingMatchId = signal<number | null>(null);
  protected readonly saveError = signal('');
  protected readonly saveSuccess = signal('');
  protected readonly needsRefresh = signal(false);
  protected readonly generatingRound = signal(false);
  protected readonly roundError = signal('');
  protected readonly roundSuccess = signal('');
  readonly nextRoundForm = new FormGroup({
    match_date: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, futureLocalDate],
    }),
  });
  readonly resultForm = new FormGroup({
    home_goals: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(0), Validators.max(2147483647), integerValue],
    }),
    away_goals: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(0), Validators.max(2147483647), integerValue],
    }),
    home_penalties: new FormControl<number | null>(null, {
      validators: [Validators.min(0), Validators.max(2147483647), integerValue],
    }),
    away_penalties: new FormControl<number | null>(null, {
      validators: [Validators.min(0), Validators.max(2147483647), integerValue],
    }),
    status: new FormControl<'live' | 'finished'>('finished', { nonNullable: true }),
  }, { validators: [validResult] });
  protected readonly roundLabels: Record<Match['round'], string> = {
    round_of_32: 'Ronda de 32',
    round_of_16: 'Octavos de final',
    quarter_final: 'Cuartos de final',
    semi_final: 'Semifinal',
    final: 'Final',
  };
  protected readonly statusLabels: Record<Match['status'], string> = {
    scheduled: 'Programado',
    live: 'En juego',
    finished: 'Finalizado',
    suspended: 'Suspendido',
  };

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.reload.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        this.saveSubscription?.unsubscribe();
        this.roundSubscription?.unsubscribe();
        this.bracket.set(null);
        this.selectedRound.set(null);
        this.selectedMatchId.set(null);
        this.errorMessage.set('');
        this.canRetry.set(false);
        this.closeResultForm();
        this.saveSuccess.set('');
        this.needsRefresh.set(false);
        this.generatingRound.set(false);
        this.roundError.set('');
        this.roundSuccess.set('');
        this.nextRoundForm.reset();

        const rawId = params.get('id');
        const id = Number(rawId);
        if (rawId === null || !/^\d+$/.test(rawId) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
          this.errorMessage.set('El identificador del torneo no es válido.');
          return EMPTY;
        }

        this.isLoading.set(true);
        return this.tournamentService.getBracket(id).pipe(
          catchError((error: unknown) => {
            this.setLoadError(error);
            return EMPTY;
          }),
          finalize(() => this.isLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(bracket => this.applyBracket(bracket));
  }

  protected retry(): void {
    if (this.canRetry() && !this.isLoading()) this.reload.next();
  }

  protected refreshMatches(): void {
    if (!this.isLoading() && this.savingMatchId() === null && !this.generatingRound()) this.reload.next();
  }

  protected selectMatch(matchId: number): void {
    if (this.matches().some(match => match.id === matchId)) this.selectedMatchId.set(matchId);
  }

  protected teamName(teamId: number): string {
    return this.teamNames().get(teamId) ?? 'Equipo no disponible';
  }

  protected result(match: Match): string | null {
    if (match.home_goals === null || match.away_goals === null) return null;
    const regularResult = `${match.home_goals} - ${match.away_goals}`;
    return match.home_penalties !== null && match.away_penalties !== null
      ? `${regularResult} (penales ${match.home_penalties} - ${match.away_penalties})`
      : regularResult;
  }

  protected canEditResult(match: Match): boolean {
    const tournament = this.tournament();
    return this.canManage() && tournament !== null && tournament.status !== 'finished' && match.status !== 'finished' &&
      Number.isFinite(Date.parse(match.match_date)) && Date.parse(match.match_date) <= Date.now();
  }

  protected openResultForm(match: BracketMatch): void {
    if (!this.canEditResult(match) || this.savingMatchId() !== null || this.generatingRound() || this.needsRefresh()) return;
    this.selectedMatchId.set(match.id);
    this.editingMatchId.set(match.id);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.resultForm.reset({
      home_goals: match.home_goals ?? 0,
      away_goals: match.away_goals ?? 0,
      home_penalties: match.home_penalties,
      away_penalties: match.away_penalties,
      status: match.status === 'live' ? 'live' : 'finished',
    });
  }

  protected cancelResultForm(): void {
    if (this.savingMatchId() === null) this.closeResultForm();
  }

  protected requiresPenalties(): boolean {
    const value = this.resultForm.getRawValue();
    return value.status === 'finished' && value.home_goals !== null && value.home_goals === value.away_goals;
  }

  protected saveResult(): void {
    const matchId = this.editingMatchId();
    const match = this.matches().find(current => current.id === matchId);
    if (!match || !this.canEditResult(match) || this.savingMatchId() !== null || this.generatingRound() || this.needsRefresh()) return;

    this.resultForm.markAllAsTouched();
    this.resultForm.updateValueAndValidity();
    if (this.resultForm.invalid) return;

    const value = this.resultForm.getRawValue();
    if (value.home_goals === null || value.away_goals === null) return;
    const finished = value.status === 'finished';
    const tied = value.home_goals === value.away_goals;
    if (finished && !window.confirm(`¿Finalizar ${this.teamName(match.home_team_id)} vs. ${this.teamName(match.away_team_id)}? El resultado ya no podrá modificarse.`)) return;
    const payload: UpdateMatchRequest = {
      tournament_id: match.tournament_id,
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      match_date: match.match_date,
      location: match.location,
      round: match.round,
      home_goals: value.home_goals,
      away_goals: value.away_goals,
      home_penalties: finished && tied ? value.home_penalties : null,
      away_penalties: finished && tied ? value.away_penalties : null,
      status: value.status,
    };

    this.savingMatchId.set(match.id);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.saveSubscription = this.matchService.update(match.id, payload).pipe(
      switchMap(updated => this.tournamentService.getBracket(match.tournament_id).pipe(
        map(bracket => ({ bracket, status: updated.status })),
        catchError(() => {
          this.saveError.set('El resultado se guardó, pero no se pudo actualizar la pantalla. Actualizá los partidos para consultar el estado real.');
          this.needsRefresh.set(true);
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.savingMatchId.set(null)),
    ).subscribe({
      next: ({ bracket, status }) => {
        this.applyBracket(bracket, match.id);
        this.editingMatchId.set(null);
        this.resultForm.reset();
        this.saveSuccess.set(status === 'finished'
          ? 'Resultado guardado. El partido quedó finalizado.'
          : 'Marcador actualizado. El partido sigue en juego.');
      },
      error: (error: unknown) => this.setSaveError(error),
    });
  }

  protected generateNextRound(): void {
    const tournament = this.tournament();
    const nextRound = this.nextRound();
    if (!tournament || !nextRound || !this.canGenerateNextRound() || this.generatingRound() ||
      this.savingMatchId() !== null || this.needsRefresh()) return;

    this.nextRoundForm.markAllAsTouched();
    this.nextRoundForm.updateValueAndValidity();
    if (this.nextRoundForm.invalid) return;

    const localDate = this.nextRoundForm.controls.match_date.value;
    const backendDate = localDate.replace('T', ' ');
    const nextRoundLabel = this.roundLabels[nextRound];
    if (!window.confirm(`¿Generar ${nextRoundLabel} con fecha ${backendDate}?`)) return;

    this.generatingRound.set(true);
    this.roundError.set('');
    this.roundSuccess.set('');
    this.roundSubscription = this.tournamentService.generateNextRound(tournament.id, {
      match_date: backendDate,
    }).pipe(
      switchMap(result => this.tournamentService.getBracket(tournament.id).pipe(
        map(bracket => ({ bracket, result })),
        catchError(() => {
          this.roundError.set('La ronda se generó, pero no se pudo actualizar la pantalla. Actualizá los partidos para consultar el estado real.');
          this.needsRefresh.set(true);
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.generatingRound.set(false)),
    ).subscribe({
      next: ({ bracket, result }) => {
        this.applyBracket(bracket);
        this.nextRoundForm.reset();
        this.roundSuccess.set(`${this.roundLabels[result.next_round]} generada correctamente.`);
      },
      error: (error: unknown) => this.setRoundError(error),
    });
  }

  private applyBracket(bracket: TournamentBracket, selectedMatchId: number | null = null): void {
    this.bracket.set(bracket);
    if (!bracket.rounds.some(round => round.round === this.selectedRound())) this.selectedRound.set(null);
    const selectedExists = selectedMatchId !== null &&
      bracket.rounds.some(round => round.matches.some(match => match.id === selectedMatchId));
    this.selectedMatchId.set(selectedExists ? selectedMatchId : null);
  }

  private closeResultForm(): void {
    this.editingMatchId.set(null);
    this.saveError.set('');
    this.resultForm.reset();
  }

  protected canManage(): boolean {
    return canManageTournament(this.auth.user(), this.tournament());
  }

  private setSaveError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) {
        this.saveError.set('No tenés permiso para gestionar este torneo.');
        return;
      }
      const body: unknown = error.error;
      const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
        ? body.message : '';
      const errors = typeof body === 'object' && body !== null && 'errors' in body && Array.isArray(body.errors)
        ? body.errors.filter((item): item is string => typeof item === 'string') : [];
      if (error.status === 400) {
        this.saveError.set(errors.some(item => item.includes('future match_date'))
          ? 'El partido todavía no puede finalizarse porque su fecha programada es futura.'
          : errors.some(item => item.includes('require home_penalties'))
            ? 'Ingresá los penales de ambos equipos para desempatar el partido.'
            : errors.some(item => item.includes('must be different'))
              ? 'El resultado por penales no puede terminar empatado.'
              : errors.some(item => item.includes('penalties are only allowed'))
                ? 'Los penales solo corresponden cuando los goles terminan empatados.'
                : 'El resultado no es válido. Revisá que todos los valores sean enteros iguales o mayores que cero.');
        return;
      }
      if (error.status === 404) {
        this.saveError.set('El partido ya no existe. Actualizá los partidos.');
        this.needsRefresh.set(true);
        return;
      }
      if (error.status === 409) {
        this.saveError.set(message === 'A finished match cannot be modified'
          ? 'El partido ya fue finalizado y su resultado no puede modificarse. Actualizá los partidos.'
          : message === 'Matches in a finished tournament cannot be modified'
            ? 'El torneo ya finalizó y sus partidos no pueden modificarse. Actualizá los partidos.'
            : 'El estado del partido o del torneo cambió. Actualizá los partidos antes de continuar.');
        this.needsRefresh.set(true);
        return;
      }
    }
    this.saveError.set('No se pudo confirmar la actualización. Actualizá los partidos para comprobar el resultado.');
    this.needsRefresh.set(true);
  }

  private setRoundError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) {
        this.roundError.set('No tenés permiso para gestionar este torneo.');
        return;
      }
      const body: unknown = error.error;
      const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
        ? body.message : '';
      const errors = typeof body === 'object' && body !== null && 'errors' in body && Array.isArray(body.errors)
        ? body.errors.filter((item): item is string => typeof item === 'string') : [];
      if (error.status === 400) {
        this.roundError.set(errors.some(item => item.includes('future'))
          ? 'La fecha de la siguiente ronda debe ser futura.'
          : errors.some(item => item.includes('match_date'))
            ? 'Ingresá una fecha y hora válidas para la siguiente ronda.'
            : 'No se pudo generar la ronda porque el cuadro no cumple las reglas del torneo.');
        return;
      }
      if (error.status === 404) {
        this.roundError.set('El torneo ya no existe. Volvé al listado de torneos.');
        this.needsRefresh.set(true);
        return;
      }
      if (error.status === 409) {
        this.roundError.set(message.includes('Every match')
          ? 'Todos los partidos de la ronda actual deben estar finalizados y tener un ganador.'
          : message.includes('already has matches')
            ? 'La siguiente ronda ya fue generada. Actualizá los partidos para verla.'
            : message.includes('already at the final')
              ? 'El torneo ya llegó a la final y no tiene una ronda posterior.'
              : message.includes('cannot advance from status')
                ? 'El torneo ya no está en curso y no puede avanzar de ronda.'
                : 'El estado del torneo cambió. Actualizá los partidos antes de continuar.');
        this.needsRefresh.set(true);
        return;
      }
      if (error.status > 0 && error.status < 500) {
        this.roundError.set('No se pudo generar la siguiente ronda. Intentá nuevamente.');
        return;
      }
    }
    this.roundError.set('No se pudo confirmar si la ronda fue generada. Actualizá los partidos antes de volver a intentarlo.');
    this.needsRefresh.set(true);
  }

  private setLoadError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        this.errorMessage.set('No se encontró el torneo. Volvé al listado de torneos.');
        return;
      }
      if (error.status === 400) {
        this.errorMessage.set('El identificador del torneo no es válido.');
        return;
      }
      if ([0, 502, 503, 504].includes(error.status)) {
        this.errorMessage.set('No se pudo conectar con el servidor. Intentá nuevamente más tarde.');
        this.canRetry.set(true);
        return;
      }
    }
    this.errorMessage.set('No se pudieron cargar los partidos y el cuadro. Intentá nuevamente.');
    this.canRetry.set(true);
  }
}

const integerValue: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value: unknown = control.value;
  return value === null || value === '' || (typeof value === 'number' && Number.isInteger(value))
    ? null : { integer: true };
};

const futureLocalDate: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  if (typeof control.value !== 'string' || control.value === '') return null;
  const timestamp = new Date(control.value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now() ? null : { futureDate: true };
};

const validResult: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const homeGoals: unknown = control.get('home_goals')?.value;
  const awayGoals: unknown = control.get('away_goals')?.value;
  const status: unknown = control.get('status')?.value;
  if (status !== 'finished' || homeGoals === null || homeGoals !== awayGoals) return null;
  const homePenalties: unknown = control.get('home_penalties')?.value;
  const awayPenalties: unknown = control.get('away_penalties')?.value;
  if (homePenalties === null || awayPenalties === null) return { penaltiesRequired: true };
  return homePenalties === awayPenalties ? { penaltiesTied: true } : null;
};

const nextRoundByRound: Record<Match['round'], Match['round'] | null> = {
  round_of_32: 'round_of_16',
  round_of_16: 'quarter_final',
  quarter_final: 'semi_final',
  semi_final: 'final',
  final: null,
};
