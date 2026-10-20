import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Team } from '../../../models/team';
import { Tournament } from '../../../models/tournament';
import { TeamForm } from './team-form';

describe('TeamForm', () => {
  let fixture: ComponentFixture<TeamForm>;
  let component: TeamForm;
  let http: HttpTestingController;
  let element: HTMLElement;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const tournament: Tournament = { id: 7, name: 'Copa Regional', location: 'Firmat', modality: 'futbol_7', max_teams: 4, rules: 'official_rules_football_7', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-09T12:00:00.000Z' };
  const team: Team = { id: 1, tournament_id: 7, name: 'Equipo Alfa', players_count: 7, has_logo: false, created_at: tournament.created_at };
  const fill = () => component.form.setValue({ name: ' Equipo Alfa ', players_count: 7 });
  const load = (current = tournament, teams: Team[] = []) => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(current);
    http.expectOne('/api/teams').flush({ data: teams });
    fixture.detectChanges();
  };
  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    await TestBed.configureTestingModule({ imports: [TeamForm], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeamForm);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it('creates and waits for the tournament and its capacity before displaying the form', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(element.querySelector('form')).toBeNull();
    fill();
    component.submit();
    http.expectNone(request => request.method === 'POST');
    http.expectOne('/api/tournaments/7').flush(tournament);
    fixture.detectChanges();
    expect(element.querySelector('form')).toBeNull();
    http.expectOne('/api/teams').flush({ data: [] });
    fixture.detectChanges();
    expect(element.querySelector('form')).not.toBeNull();
    expect(element.querySelector('[formControlName="tournament_id"]')).toBeNull();
    expect(element.textContent).toContain('Copa Regional');
  });

  it('rejects an empty form without sending requests', () => {
    load();
    component.submit();
    fixture.detectChanges();
    expect(component.form.invalid).toBe(true);
    expect(component.form.controls.name.touched).toBe(true);
    expect(element.querySelector('#team-name-error')).not.toBeNull();
    expect(element.querySelector('#players-error')).not.toBeNull();
    http.expectNone(request => request.method === 'POST');
  });

  it.each(['', '   ', '123', '-1.5', '1e2', 'abc\0', 'a'.repeat(101)])('rejects invalid name %s', name => {
    load();
    component.form.setValue({ name, players_count: 7 });
    component.submit();
    expect(component.form.controls.name.invalid).toBe(true);
    http.expectNone(request => request.method === 'POST');
  });

  it('accepts the backend Unicode name limit', () => {
    load();
    component.form.controls.name.setValue('\u{1F3C6}'.repeat(100));
    expect(component.form.controls.name.valid).toBe(true);
    component.form.controls.name.setValue('\u{1F3C6}'.repeat(101));
    expect(component.form.controls.name.invalid).toBe(true);
  });

  it.each([
    ['futbol_5', 5, 10], ['futbol_7', 7, 14], ['futbol_11', 11, 22],
  ] as const)('validates exact player limits for %s', (modality, min, max) => {
    load({ ...tournament, modality });
    const control = component.form.controls.players_count;
    for (const value of [null, 0, -1, min - 1, max + 1, min + 0.5]) {
      control.setValue(value);
      expect(control.invalid).toBe(true);
    }
    for (const value of [min, max]) {
      control.setValue(value);
      expect(control.valid).toBe(true);
    }
    const input = element.querySelector('input[type="number"]');
    expect(input?.getAttribute('min')).toBe(String(min));
    expect(input?.getAttribute('max')).toBe(String(max));
  });

  it('posts the route tournament ID and trimmed name only once, then returns to its teams', () => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill();
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(element.querySelector('fieldset')?.disabled).toBe(true);
    expect(element.textContent).toContain('Guardando equipo');
    const request = http.expectOne('/api/teams');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ tournament_id: 7, name: 'Equipo Alfa', players_count: 7 });
    request.flush({ message: 'Team created successfully', data: team }, { status: 201, statusText: 'Created' });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/tournaments', 7, 'teams']);
    component.submit();
    http.expectNone(request => request.method === 'POST');
  });

  it('counts only teams belonging to this tournament for capacity', () => {
    load(tournament, Array.from({ length: 5 }, (_, i) => ({ ...team, id: i + 1, tournament_id: 8 })));
    expect(component.restriction()).toBe('');
    expect(element.querySelector('form')).not.toBeNull();
  });

  it.each(['in_progress', 'finished'] as const)('prevents creation in a %s tournament even via a direct URL', status => {
    load({ ...tournament, status });
    fill();
    component.submit();
    expect(element.querySelector('form')).toBeNull();
    expect(element.textContent).toContain('No se pueden agregar equipos');
    http.expectNone(request => request.method === 'POST');
  });

  it('prevents creation when all places are already occupied', () => {
    load(tournament, Array.from({ length: 4 }, (_, i) => ({ ...team, id: i + 1 })));
    fill();
    component.submit();
    expect(element.querySelector('form')).toBeNull();
    expect(element.textContent).toContain('capacidad m\u00e1xima');
    http.expectNone(request => request.method === 'POST');
  });

  it.each([null, '', 'abc', '0', '-1', '1.5', '1e2', '2147483648'])('rejects invalid ID %s before HTTP or submit', id => {
    params.next(convertToParamMap(id === null ? {} : { id }));
    fixture.detectChanges();
    fill();
    component.submit();
    expect(element.textContent).toContain('identificador');
    expect(element.querySelector('form')).toBeNull();
    http.expectNone(() => true);
  });

  it('shows a missing tournament without requesting teams', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.textContent).toContain('No se encontr\u00f3 el torneo');
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('button')).toBeNull();
    http.expectNone('/api/teams');
  });

  it('retries a failed capacity lookup and does not expose a form until it succeeds', () => {
    fixture.detectChanges();
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('form')).toBeNull();
    expect(element.textContent).toContain('No se pudo conectar');
    component.retry();
    component.retry();
    http.expectOne('/api/tournaments/7').flush(tournament);
    http.expectOne('/api/teams').flush({ data: [] });
    fixture.detectChanges();
    expect(element.querySelector('form')).not.toBeNull();
  });

  it('preserves the form and permits correction after a duplicate name response', () => {
    load();
    fill();
    component.submit();
    http.expectOne('/api/teams').flush({ message: 'A team with the same name already exists in that tournament' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.textContent).toContain('Ya existe un equipo');
    expect(component.isSaving()).toBe(false);
    expect(component.form.controls.name.value).toBe(' Equipo Alfa ');
    component.form.controls.name.setValue('Equipo Beta');
    component.submit();
    http.expectOne('/api/teams').flush({ message: 'Error' }, { status: 500, statusText: 'Error' });
  });

  it.each([
    [409, 'The tournament already has its maximum of 4 teams', 'capacidad m\u00e1xima'],
    [409, 'Teams can only be registered or edited while the tournament is open', 'No se pueden agregar equipos'],
    [404, 'The tournament_id does not exist', 'ya no existe'],
  ] as const)('honors a server restriction after loading: %s %s', (status, message, expected) => {
    load();
    fill();
    component.submit();
    http.expectOne('/api/teams').flush({ message }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.textContent).toContain(expected);
    expect(element.querySelector('form')).toBeNull();
    component.submit();
    http.expectNone(request => request.method === 'POST');
  });

  it.each([0, 400, 409, 500, 502, 503, 504])('handles save error %s without displaying raw backend details', status => {
    load();
    fill();
    component.submit();
    const request = http.expectOne('/api/teams');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ message: 'raw database exception' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).not.toContain('raw database');
    expect(component.isSaving()).toBe(false);
    expect(component.form.controls.name.value).toBe(' Equipo Alfa ');
  });

  it.each([['Cancelar', '/tournaments/7/teams'], ['Volver al torneo', '/tournaments/7']])('navigates using %s', async (label, target) => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = Array.from(element.querySelectorAll('a')).find(link => link.textContent === label);
    expect(link?.getAttribute('href')).toBe(target);
    link?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0][0].toString()).toBe(target);
    http.expectNone(request => request.method === 'POST');
  });

  it('cancels a pending save and resets the form when navigating to another tournament', () => {
    load();
    fill();
    component.submit();
    const old = http.expectOne('/api/teams');
    params.next(convertToParamMap({ id: '8' }));
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/tournaments/8').flush({ ...tournament, id: 8, modality: 'futbol_11' });
    http.expectOne('/api/teams').flush({ data: [] });
    expect(component.isSaving()).toBe(false);
    expect(component.form.controls.name.value).toBe('');
    component.form.setValue({ name: 'Equipo Beta', players_count: 11 });
    component.submit();
    const request = http.expectOne('/api/teams');
    expect(request.request.body.tournament_id).toBe(8);
    request.flush({}, { status: 500, statusText: 'Error' });
  });

  it('cancels a pending load when the next ID is invalid', () => {
    fixture.detectChanges();
    const request = http.expectOne('/api/tournaments/7');
    params.next(convertToParamMap({ id: 'invalid' }));
    expect(request.cancelled).toBe(true);
    expect(component.isLoading()).toBe(false);
    http.expectNone(() => true);
  });

  it('cancels the pending save on destruction', () => {
    load();
    fill();
    component.submit();
    const request = http.expectOne('/api/teams');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
