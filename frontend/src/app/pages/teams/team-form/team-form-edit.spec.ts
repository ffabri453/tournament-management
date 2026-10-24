import { Auth } from '../../../core/services/auth';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Team } from '../../../models/team';
import { Tournament } from '../../../models/tournament';
import { TeamForm } from './team-form';

describe('TeamForm editing', () => {
  let fixture: ComponentFixture<TeamForm>;
  let component: TeamForm;
  let http: HttpTestingController;
  let element: HTMLElement;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const tournament: Tournament = { organizer_id: 1, id: 7, name: 'Copa Regional', location: 'Firmat', modality: 'futbol_7', max_teams: 4, rules: 'official_rules_football_7', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-16T12:00:00.000Z' };
  const team: Team = { id: 12, tournament_id: 7, name: 'Equipo Alfa', players_count: 7, has_logo: false, created_at: tournament.created_at };
  const load = (current = tournament, currentTeam = team) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(current);
    http.expectOne('/api/teams/12').flush({ data: currentTeam });
    if (currentTeam.has_logo) {
      const logo = http.expectOne('/api/teams/12/logo');
      expect(logo.request.method).toBe('GET');
      expect(logo.request.responseType).toBe('blob');
      logo.flush(new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' }));
    }
    fixture.detectChanges();
  };
  beforeEach(async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true, writable: true, value: vi.fn(() => 'blob:team-logo'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true, writable: true, value: vi.fn(),
    });
    params = new BehaviorSubject(convertToParamMap({ id: '7', teamId: '12' }));
    await TestBed.configureTestingModule({ imports: [TeamForm], providers: [{ provide: Auth, useValue: { user: () => ({ id: 1, role: 'organizer' }) } },
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeamForm);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it('loads the real team and prepopulates the shared form without checking free places', () => {
    load();
    expect(element.querySelector('h1')?.textContent).toBe('Editar equipo');
    expect(component.form.getRawValue()).toEqual({ name: team.name, players_count: 7 });
    expect(component.restriction()).toBe('');
    http.expectNone('/api/teams');
  });

  it('sends a trimmed PUT once and returns to the same tournament teams', () => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.form.setValue({ name: ' Equipo editado ', players_count: 10 });
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(element.querySelector('fieldset')?.disabled).toBe(true);
    const request = http.expectOne('/api/teams/12');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ tournament_id: 7, name: 'Equipo editado', players_count: 10 });
    request.flush({ data: { ...team, ...request.request.body } });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/tournaments', 7, 'teams']);
    component.submit();
    http.expectNone(() => true);
  });

  it('previews and uploads a supported logo after preserving the team data', async () => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'escudo.png', { type: 'image/png' });
    component.selectLogo({ target: { files: [file], value: '' } } as unknown as Event);
    expect(component.logoFile()).toBe(file);
    component.logoPreview.set('data:image/png;base64,iVBORw0KGgo=');
    fixture.detectChanges();
    expect(element.querySelector<HTMLImageElement>('.logo-preview img')?.src).toContain('data:image/png;base64');
    component.submit();
    const teamRequest = http.expectOne('/api/teams/12');
    expect(teamRequest.request.body).toEqual({ tournament_id: 7, name: team.name, players_count: 7 });
    teamRequest.flush({ data: team });
    const logoRequest = http.expectOne('/api/teams/12/logo');
    expect(logoRequest.request.method).toBe('PUT');
    expect(logoRequest.request.body).toBe(file);
    logoRequest.flush({ message: 'OK', data: { team_id: 12, has_logo: true } });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/tournaments', 7, 'teams']);
  });

  it.each(['in_progress', 'finished'] as const)('can remove a logo from a %s tournament', status => {
    load({ ...tournament, status }, { ...team, has_logo: true });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const input = element.querySelector<HTMLInputElement>('#team-logo')!;
    expect(element.querySelector<HTMLImageElement>('.logo-preview img')?.getAttribute('src')).toBe('blob:team-logo');
    component.removeLogo(input);
    fixture.detectChanges();
    expect(element.textContent).toContain('se quitará al guardar');
    component.submit();
    const teamRequest = http.expectOne('/api/teams/12');
    expect(teamRequest.request.body).toEqual({ tournament_id: 7, name: team.name, players_count: 7 });
    teamRequest.flush({ data: { ...team, has_logo: true } });
    const logoRequest = http.expectOne('/api/teams/12/logo');
    expect(logoRequest.request.method).toBe('DELETE');
    logoRequest.flush({ message: 'OK', data: { team_id: 12, has_logo: false } });
  });

  it('rejects unsupported and oversized files before saving', () => {
    load();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const input = { files: [new File(['text'], 'escudo.txt', { type: 'text/plain' })], value: 'selected' };
    component.selectLogo({ target: input } as unknown as Event);
    expect(component.logoError()).toContain('PNG, JPG o WebP');
    expect(input.value).toBe('');
    const oversized = { files: [new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' })], value: 'selected' };
    component.selectLogo({ target: oversized } as unknown as Event);
    expect(component.logoError()).toContain('1 MB');
    component.submit();
    http.expectNone('/api/teams/12');
    http.expectNone('/api/teams/12/logo');
  });

  it('shows the backend format rejection without navigating', () => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const file = new File(['not really an image'], 'fake.png', { type: 'image/png' });
    component.selectLogo({ target: { files: [file], value: '' } } as unknown as Event);
    component.submit();
    http.expectOne('/api/teams/12').flush({ data: team });
    http.expectOne('/api/teams/12/logo').flush(
      { message: 'Team logo must be a valid PNG, JPEG or WebP image' },
      { status: 415, statusText: 'Unsupported Media Type' },
    );
    fixture.detectChanges();
    expect(component.logoError()).toContain('no es una imagen PNG, JPG o WebP válida');
    expect(component.isSaving()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not save before the team arrives', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(tournament);
    component.form.setValue({ name: 'Cambio', players_count: 8 });
    component.submit();
    http.expectNone(request => request.method === 'PUT');
    http.expectOne('/api/teams/12').flush({ data: team });
  });

  it.each(['', 'abc', '0', '-1', '1.5', '1e2', '2147483648'])('rejects invalid team ID %s before HTTP', teamId => {
    params.next(convertToParamMap({ id: '7', teamId }));
    fixture.detectChanges();
    component.submit();
    expect(element.textContent).toContain('identificador del equipo');
    http.expectNone(() => true);
  });

  it('rejects a team belonging to another tournament rather than moving it', () => {
    load(tournament, { ...team, tournament_id: 8 });
    expect(element.textContent).toContain('no pertenece');
    expect(element.querySelector('form')).toBeNull();
    component.form.setValue({ name: 'Cambio', players_count: 8 });
    component.submit();
    http.expectNone(() => true);
  });

  it.each([400, 404, 500, 503])('handles team lookup failure %s without exposing the form', status => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams/12').flush({ message: 'raw database error' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).not.toContain('raw database');
    component.submit();
    http.expectNone(() => true);
  });

  it.each(['in_progress', 'finished'] as const)('permits only renaming in a %s tournament', status => {
    load({ ...tournament, status });
    expect(element.querySelector<HTMLInputElement>('#players-count')?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('#team-name')?.disabled).toBe(false);
    expect(element.textContent).toContain('Solo se puede cambiar el nombre');
    component.form.setValue({ name: 'Nuevo nombre', players_count: 999 });
    component.submit();
    const request = http.expectOne('/api/teams/12');
    expect(request.request.body).toEqual({ tournament_id: 7, name: 'Nuevo nombre', players_count: 7 });
    request.flush({}, { status: 500, statusText: 'Error' });
  });

  it.each([
    ['futbol_5', 5, 10], ['futbol_7', 7, 14], ['futbol_11', 11, 22],
  ] as const)('retains name and player validations while editing %s', (modality, min, max) => {
    load({ ...tournament, modality }, { ...team, players_count: min });
    for (const players_count of [null, 0, min - 1, max + 1, min + 0.5]) {
      component.form.setValue({ name: 'Equipo', players_count });
      component.submit();
      expect(component.form.invalid).toBe(true);
    }
    for (const name of ['', '   ', '123', 'a'.repeat(101)]) {
      component.form.setValue({ name, players_count: min });
      component.submit();
      expect(component.form.invalid).toBe(true);
    }
    http.expectNone(() => true);
  });

  it('preserves entered values on duplicate name and allows correction', () => {
    load();
    component.form.controls.name.setValue('Equipo duplicado');
    component.submit();
    http.expectOne('/api/teams/12').flush({ message: 'A team with the same name already exists in that tournament' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.textContent).toContain('Ya existe un equipo');
    expect(component.form.controls.name.value).toBe('Equipo duplicado');
    expect(component.isSaving()).toBe(false);
    component.form.controls.name.setValue('Otro nombre');
    component.submit();
    http.expectOne('/api/teams/12').flush({}, { status: 500, statusText: 'Error' });
  });

  it.each([
    [404, 'Team not found', 'ya no existe'],
    [409, 'Only the team name can be changed after the tournament has started', 'estado del torneo cambi'],
  ] as const)('blocks stale saves after %s', (status, message, expected) => {
    load();
    component.form.controls.players_count.setValue(8);
    component.submit();
    http.expectOne('/api/teams/12').flush({ message }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.textContent).toContain(expected);
    expect(element.querySelector('form')).toBeNull();
    component.submit();
    http.expectNone(() => true);
  });

  it.each([0, 400, 409, 500, 503])('handles update failure %s without navigating or exposing internals', status => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    component.submit();
    const request = http.expectOne('/api/teams/12');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ message: 'raw database error' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).not.toContain('raw database');
    expect(component.form.controls.name.value).toBe(team.name);
  });

  it('cancels an old save on team navigation and resets edit mode on the new route', () => {
    load();
    component.submit();
    const old = http.expectOne('/api/teams/12');
    params.next(convertToParamMap({ id: '7', teamId: '13' }));
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams/13').flush({ data: { ...team, id: 13, name: 'Equipo Beta' } });
    expect(component.form.controls.name.value).toBe('Equipo Beta');
    params.next(convertToParamMap({ id: '7' }));
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams').flush({ data: [] });
    expect(component.isEditing()).toBe(false);
    expect(component.form.controls.name.value).toBe('');
    expect(component.form.controls.players_count.enabled).toBe(true);
  });

  it('cancels the pending update on destruction', () => {
    load();
    component.submit();
    const request = http.expectOne('/api/teams/12');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
