import { Loading } from '../../../shared/loading';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, EMPTY, finalize, map, Observable, of, startWith, Subject, Subscription, switchMap } from 'rxjs';
import { TeamService } from '../../../core/services/team';
import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';
import { Team } from '../../../models/team';
import { Auth } from '../../../core/services/auth';
import { canManageTournament } from '../../../core/tournament-access';

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
const logoMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
const logoMaxBytes = 1024 * 1024;

@Component({
  selector: 'app-team-form',
  imports: [ReactiveFormsModule, RouterLink, Loading],
  templateUrl: './team-form.html',
  styleUrl: './team-form.css',
})
export class TeamForm implements OnInit {
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly teamService = inject(TeamService);
  private readonly tournamentService = inject(TournamentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = new Subject<void>();
  private saveSubscription?: Subscription;
  private logoLoadSubscription?: Subscription;
  private storedLogoObjectUrl: string | null = null;
  private logoRequestActive = false;
  private createdTeamForLogoRequest: Team | null = null;

  readonly tournament = signal<Tournament | null>(null);
  readonly isEditing = signal(false);
  private readonly selectedTeam = signal<Team | null>(null);
  readonly structureLocked = computed(() => this.isEditing() && this.tournament()?.status !== 'open');
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly logoError = signal('');
  readonly logoPreview = signal<string | null>(null);
  readonly storedLogoPreview = signal<string | null>(null);
  readonly logoFile = signal<File | null>(null);
  readonly logoRemovalRequested = signal(false);
  readonly logoImageFailed = signal(false);
  readonly invalidLogoSelection = signal(false);
  readonly createdTeamAfterLogoFailure = signal<Team | null>(null);
  readonly canRetry = signal(false);
  private readonly teamCount = signal(0);
  private readonly serverRestriction = signal('');
  readonly limits = computed(() => {
    const tournament = this.tournament();
    return tournament ? playerLimits[tournament.modality] : null;
  });
  readonly logoSource = computed(() => {
    if (this.logoImageFailed() || this.logoRemovalRequested()) return null;
    const preview = this.logoPreview();
    if (preview) return preview;
    return this.storedLogoPreview();
  });
  readonly canRemoveLogo = computed(() =>
    !this.logoRemovalRequested() && (this.logoFile() !== null || this.selectedTeam()?.has_logo === true)
  );
  readonly restriction = computed(() => {
    if (this.serverRestriction()) return this.serverRestriction();
    const tournament = this.tournament();
    if (!tournament) return '';
    if (!canManageTournament(this.auth.user(), tournament)) return 'No tenés permiso para gestionar este torneo.';
    if (this.isEditing()) return '';
    if (tournament.status !== 'open') return 'El torneo ya fue iniciado o finalizado. No se pueden agregar equipos.';
    if (this.teamCount() >= tournament.max_teams) return 'El torneo alcanz\u00f3 su capacidad m\u00e1xima de equipos.';
    return '';
  });
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, validName] }),
    players_count: new FormControl<number | null>(null, { validators: [Validators.required, wholeNumber] }),
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.clearStoredLogo());
    combineLatest([this.route.paramMap, this.reload.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        this.saveSubscription?.unsubscribe();
        this.logoRequestActive = false;
        this.isSaving.set(false);
        this.tournament.set(null);
        this.selectedTeam.set(null);
        const rawTeamId = params.get('teamId');
        this.isEditing.set(rawTeamId !== null);
        this.teamCount.set(0);
        this.loadError.set('');
        this.saveError.set('');
        this.createdTeamAfterLogoFailure.set(null);
        this.createdTeamForLogoRequest = null;
        this.resetLogoState();
        this.serverRestriction.set('');
        this.canRetry.set(false);
        this.form.enable();
        this.form.reset();
        const rawId = params.get('id');
        const id = Number(rawId);
        if (rawId === null || !/^\d+$/.test(rawId) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
          this.loadError.set('El identificador del torneo no es v\u00e1lido.');
          return EMPTY;
        }
        const teamId = Number(rawTeamId);
        if (rawTeamId !== null && (!/^\d+$/.test(rawTeamId) || !Number.isInteger(teamId) || teamId <= 0 || teamId > 2147483647)) {
          this.loadError.set('El identificador del equipo no es v\u00e1lido.');
          return EMPTY;
        }
        this.isLoading.set(true);
        return this.tournamentService.getById(id).pipe(
          switchMap(tournament => {
            if (rawTeamId !== null) {
              return this.teamService.getById(teamId).pipe(
                map(team => ({ tournament, count: 0, team: team as Team | null })),
              );
            }
            return this.teamService.getByTournamentId(id).pipe(
              map(teams => ({ tournament, count: teams.length, team: null as Team | null })),
            );
          }),
          catchError((error: unknown) => {
            const status = error instanceof HttpErrorResponse ? error.status : null;
            this.canRetry.set(status !== 400 && status !== 404);
            this.loadError.set(status === 404 ? (this.isEditing() ? 'No se encontr\u00f3 el torneo o el equipo.' : 'No se encontr\u00f3 el torneo.') :
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
    ).subscribe(({ tournament, count, team }) => {
      if (team && team.tournament_id !== tournament.id) {
        this.loadError.set('El equipo no pertenece a este torneo. Volv\u00e9 al listado de equipos.');
        return;
      }
      this.tournament.set(tournament);
      this.selectedTeam.set(team);
      this.loadStoredLogo(team);
      this.teamCount.set(count);
      const limits = playerLimits[tournament.modality];
      this.form.controls.players_count.setValidators([
        Validators.required, wholeNumber, Validators.min(limits.min), Validators.max(limits.max),
      ]);
      this.form.controls.players_count.updateValueAndValidity();
      if (team) this.form.setValue({ name: team.name, players_count: team.players_count });
      if (this.structureLocked()) this.form.controls.players_count.disable();
    });
  }

  selectLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.logoError.set('');
    if (!file) return;
    if (!logoMimeTypes.includes(file.type)) {
      this.clearPendingLogoSelection();
      this.invalidLogoSelection.set(true);
      this.logoError.set('Seleccioná una imagen PNG, JPG o WebP.');
      input.value = '';
      return;
    }
    if (file.size === 0 || file.size > logoMaxBytes) {
      this.clearPendingLogoSelection();
      this.invalidLogoSelection.set(true);
      this.logoError.set('El escudo debe tener contenido y pesar como máximo 1 MB.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (this.logoFile() !== file || typeof reader.result !== 'string') return;
      this.logoPreview.set(reader.result);
    });
    reader.addEventListener('error', () => {
      if (this.logoFile() !== file) return;
      this.logoFile.set(null);
      this.logoPreview.set(null);
      this.invalidLogoSelection.set(true);
      this.logoError.set('No se pudo leer la imagen seleccionada.');
    });
    this.logoFile.set(file);
    this.logoRemovalRequested.set(false);
    this.logoImageFailed.set(false);
    this.invalidLogoSelection.set(false);
    reader.readAsDataURL(file);
  }

  removeLogo(input: HTMLInputElement): void {
    input.value = '';
    this.logoFile.set(null);
    this.logoPreview.set(null);
    this.logoRemovalRequested.set(this.isEditing());
    this.logoImageFailed.set(false);
    this.invalidLogoSelection.set(false);
    this.logoError.set('');
  }

  keepCurrentLogo(input: HTMLInputElement): void {
    input.value = '';
    this.logoFile.set(null);
    this.logoPreview.set(null);
    this.logoRemovalRequested.set(false);
    this.logoImageFailed.set(false);
    this.invalidLogoSelection.set(false);
    this.logoError.set('');
  }

  logoLoadFailed(): void {
    this.logoImageFailed.set(true);
    this.logoError.set('No se pudo mostrar el escudo actual. Podés reemplazarlo o quitarlo.');
  }

  retry(): void {
    if (this.canRetry() && !this.isLoading()) this.reload.next();
  }

  submit(): void {
    const tournament = this.tournament();
    const team = this.selectedTeam();
    if (!tournament || this.isLoading() || this.isSaving() || this.loadError() || this.restriction() ||
        this.invalidLogoSelection() || this.createdTeamAfterLogoFailure() || (this.isEditing() && !team)) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { name, players_count } = this.form.getRawValue();
    if (players_count === null) return;
    this.isSaving.set(true);
    this.logoRequestActive = false;
    this.createdTeamForLogoRequest = null;
    this.saveError.set('');
    this.logoError.set('');
    const payload = {
      tournament_id: tournament.id, name: name.trim(),
      players_count: this.structureLocked() && team ? team.players_count : players_count,
    };
    const request = team ? this.teamService.update(team.id, payload) : this.teamService.create(payload);
    this.saveSubscription = request.pipe(
      switchMap(updatedTeam => {
        if (!team && this.logoFile()) this.createdTeamForLogoRequest = updatedTeam;
        return this.saveLogo(updatedTeam).pipe(map(() => updatedTeam));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => { void this.router.navigate(['/tournaments', tournament.id, 'teams']); },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.handleSaveError(error);
      },
    });
  }

  private saveLogo(team: Team): Observable<unknown> {
    if (!canManageTournament(this.auth.user(), this.tournament())) return EMPTY;
    const file = this.logoFile();
    if (file) {
      this.logoRequestActive = true;
      return this.teamService.uploadLogo(team.id, file);
    }
    if (this.logoRemovalRequested()) {
      this.logoRequestActive = true;
      return this.teamService.deleteLogo(team.id);
    }
    return of(null);
  }

  private resetLogoState(): void {
    this.clearStoredLogo();
    this.logoError.set('');
    this.logoPreview.set(null);
    this.logoFile.set(null);
    this.logoRemovalRequested.set(false);
    this.logoImageFailed.set(false);
    this.invalidLogoSelection.set(false);
    this.createdTeamAfterLogoFailure.set(null);
    this.createdTeamForLogoRequest = null;
  }

  private loadStoredLogo(team: Team | null): void {
    if (!team?.has_logo) return;
    this.logoLoadSubscription = this.teamService.getLogo(team.id).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: blob => {
        this.clearStoredLogo();
        this.storedLogoObjectUrl = URL.createObjectURL(blob);
        this.storedLogoPreview.set(this.storedLogoObjectUrl);
      },
      error: () => {
        this.logoImageFailed.set(true);
        this.logoError.set('No se pudo cargar el escudo actual. Podés reemplazarlo o quitarlo.');
      },
    });
  }

  private clearStoredLogo(): void {
    this.logoLoadSubscription?.unsubscribe();
    this.logoLoadSubscription = undefined;
    if (this.storedLogoObjectUrl) URL.revokeObjectURL(this.storedLogoObjectUrl);
    this.storedLogoObjectUrl = null;
    this.storedLogoPreview.set(null);
  }

  private clearPendingLogoSelection(): void {
    this.logoFile.set(null);
    this.logoPreview.set(null);
    this.logoRemovalRequested.set(false);
    this.logoImageFailed.set(false);
  }

  private handleSaveError(error: unknown): void {
    if (this.logoRequestActive && this.createdTeamForLogoRequest) {
      this.createdTeamAfterLogoFailure.set(this.createdTeamForLogoRequest);
      this.logoError.set('El equipo fue creado correctamente, pero no se pudo guardar el escudo. Abrí la edición del equipo para reintentar sin crear un duplicado.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.serverRestriction.set('No tenés permiso para gestionar este torneo.');
      return;
    }
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
        ? body.message : '';
      if (this.logoRequestActive) {
        if (error.status === 413) {
          this.logoError.set('El escudo supera el tamaño máximo de 1 MB.');
          return;
        }
        if (error.status === 415) {
          this.logoError.set('El archivo no es una imagen PNG, JPG o WebP válida.');
          return;
        }
        if (error.status === 404) {
          this.logoError.set('El equipo ya no existe. Volvé al listado de equipos.');
          return;
        }
        if ([0, 502, 503, 504].includes(error.status)) {
          this.logoError.set('No se pudo confirmar el guardado del escudo. Revisá el equipo antes de intentar nuevamente.');
          return;
        }
        if (error.status >= 400) {
          this.logoError.set('No se pudo guardar el escudo. Verificá el archivo e intentá nuevamente.');
          return;
        }
      }
      if (error.status === 404) {
        this.serverRestriction.set(this.isEditing()
          ? 'El torneo o el equipo ya no existe. Volv\u00e9 al listado de equipos.'
          : 'El torneo ya no existe. Volv\u00e9 al listado de torneos.');
        return;
      }
      if (error.status === 409) {
        if (message === 'A team with the same name already exists in that tournament') {
          this.saveError.set('Ya existe un equipo con ese nombre en este torneo.');
          return;
        }
        if (this.isEditing() && [
          'Only the team name can be changed after the tournament has started',
          'A team cannot leave a tournament after it has started',
          'Teams can only be registered or edited while the tournament is open',
        ].includes(message)) {
          this.serverRestriction.set('El estado del torneo cambi\u00f3. Volv\u00e9 al listado y abr\u00ed el equipo de nuevo; una vez iniciado solo se puede editar el nombre.');
          return;
        }
        if (message === 'The team cannot be changed because it is referenced by a match') {
          this.saveError.set('El equipo est\u00e1 asociado a partidos y no admite ese cambio.');
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
