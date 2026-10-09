import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, EMPTY, finalize, map, startWith, Subject, Subscription, switchMap } from 'rxjs';
import { TeamService } from '../../../core/services/team';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';

const playerLimits: Record<Tournament['modality'], { min: number; max: number }> = {
  futbol_5: { min: 5, max: 10 },
  futbol_7: { min: 7, max: 14 },
  futbol_11: { min: 11, max: 22 },
};

const validName: ValidatorFn = control => {
  const value: unknown = control.value;
  if (typeof value !== 'string') return { name: true };
  const name = value.trim();
  return name.length > 0 && Array.from(name).length <= 100 && !name.includes('\0') &&
    !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(name)
    ? null : { name: true };
};

const wholeNumber: ValidatorFn = control => Number.isInteger(control.value) ? null : { integer: true };

@Component({
  selector: 'app-team-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './team-form.html',
  styleUrl: './team-form.css',
})
export class TeamForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly teamService = inject(TeamService);
  private readonly tournamentService = inject(TournamentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = new Subject<void>();
  private saveSubscription?: Subscription;

  readonly tournament = signal<Tournament | null>(null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly canRetry = signal(false);
  private readonly teamCount = signal(0);
  private readonly serverRestriction = signal('');
  readonly limits = computed(() => {
    const tournament = this.tournament();
    return tournament ? playerLimits[tournament.modality] : null;
  });
  readonly restriction = computed(() => {
    if (this.serverRestriction()) return this.serverRestriction();
    const tournament = this.tournament();
    if (!tournament) return '';
    if (tournament.status !== 'open') return 'El torneo ya fue iniciado o finalizado. No se pueden agregar equipos.';
    if (this.teamCount() >= tournament.max_teams) return 'El torneo alcanz\u00f3 su capacidad m\u00e1xima de equipos.';
    return '';
  });
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, validName] }),
    players_count: new FormControl<number | null>(null, { validators: [Validators.required, wholeNumber] }),
  });

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.reload.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        this.saveSubscription?.unsubscribe();
        this.isSaving.set(false);
        this.tournament.set(null);
        this.teamCount.set(0);
        this.loadError.set('');
        this.saveError.set('');
        this.serverRestriction.set('');
        this.canRetry.set(false);
        this.form.reset();
        const rawId = params.get('id');
        const id = Number(rawId);
        if (rawId === null || !/^\d+$/.test(rawId) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
          this.loadError.set('El identificador del torneo no es v\u00e1lido.');
          return EMPTY;
        }
        this.isLoading.set(true);
        return this.tournamentService.getById(id).pipe(
          switchMap(tournament => this.teamService.getByTournamentId(id).pipe(
            map(teams => ({ tournament, count: teams.length })),
          )),
          catchError((error: unknown) => {
            const status = error instanceof HttpErrorResponse ? error.status : null;
            this.canRetry.set(status !== 400 && status !== 404);
            this.loadError.set(status === 404 ? 'No se encontr\u00f3 el torneo.' :
              status === 400 ? 'El identificador del torneo no es v\u00e1lido.' :
              status !== null && [0, 502, 503, 504].includes(status)
                ? 'No se pudo conectar con el servidor. Intent\u00e1 nuevamente.'
                : 'No se pudo cargar el torneo y sus equipos. Intent\u00e1 nuevamente.');
            return EMPTY;
          }),
          finalize(() => this.isLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ tournament, count }) => {
      this.tournament.set(tournament);
      this.teamCount.set(count);
      const limits = playerLimits[tournament.modality];
      this.form.controls.players_count.setValidators([
        Validators.required, wholeNumber, Validators.min(limits.min), Validators.max(limits.max),
      ]);
      this.form.controls.players_count.updateValueAndValidity();
    });
  }

  retry(): void {
    if (this.canRetry() && !this.isLoading()) this.reload.next();
  }

  submit(): void {
    const tournament = this.tournament();
    if (!tournament || this.isLoading() || this.isSaving() || this.loadError() || this.restriction()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { name, players_count } = this.form.getRawValue();
    if (players_count === null) return;
    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSubscription = this.teamService.create({ tournament_id: tournament.id, name: name.trim(), players_count }).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => { void this.router.navigate(['/tournaments', tournament.id, 'teams']); },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.handleSaveError(error);
      },
    });
  }

  private handleSaveError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
        ? body.message : '';
      if (error.status === 404) {
        this.serverRestriction.set('El torneo ya no existe. Volv\u00e9 al listado de torneos.');
        return;
      }
      if (error.status === 409) {
        if (message === 'A team with the same name already exists in that tournament') {
          this.saveError.set('Ya existe un equipo con ese nombre en este torneo.');
          return;
        }
        if (/^The tournament already has its maximum of \d+ teams$/.test(message)) {
          this.serverRestriction.set('El torneo alcanz\u00f3 su capacidad m\u00e1xima de equipos.');
          return;
        }
        if (message === 'Teams can only be registered or edited while the tournament is open') {
          this.serverRestriction.set('El torneo ya fue iniciado o finalizado. No se pueden agregar equipos.');
          return;
        }
        this.saveError.set('No se pudo agregar el equipo por un conflicto con los datos actuales del torneo.');
        return;
      }
      if (error.status === 400) {
        this.saveError.set('Los datos del equipo no son v\u00e1lidos. Revis\u00e1 el nombre y la cantidad de jugadores para la modalidad del torneo.');
        return;
      }
      if ([0, 502, 503, 504].includes(error.status)) {
        this.saveError.set('No se pudo confirmar el guardado. Revis\u00e1 el listado de equipos antes de intentar nuevamente.');
        return;
      }
    }
    this.saveError.set('No se pudo guardar el equipo. Revis\u00e1 el listado antes de intentar nuevamente.');
  }
}
