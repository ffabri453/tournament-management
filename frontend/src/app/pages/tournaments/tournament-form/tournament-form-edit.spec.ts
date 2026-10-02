import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Tournament } from '../../../models/tournament';
import { TournamentForm } from './tournament-form';

describe('TournamentForm editing', () => {
  let fixture: ComponentFixture<TournamentForm>;
  let component: TournamentForm;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const tournament: Tournament = { id: 5, name: 'Copa', location: 'Firmat', modality: 'futbol_5', max_teams: 4, rules: 'official_rules_football_5', format: 'knockout', status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' };
  const load = (value = tournament) => {
    http.expectOne('/api/tournaments/5').flush(value);
    fixture.detectChanges();
  };
  const element = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({ id: '5' }));
    await TestBed.configureTestingModule({
      imports: [TournamentForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TournamentForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('detects editing, loads the route id and prefills the form', () => {
    expect(component.isEditing()).toBe(true);
    expect(element().textContent).toContain('Cargando torneo');
    expect(element().querySelector('form')).toBeNull();
    component.submit();
    expect(http.match((request) => request.method === 'PUT')).toHaveLength(0);
    load();
    expect(component.isLoading()).toBe(false);
    expect(component.form.getRawValue()).toEqual({ name: 'Copa', location: 'Firmat', modality: 'futbol_5', max_teams: 4 });
    expect(element().textContent).toContain('Guardar cambios');
  });

  it('does not update invalid values', () => {
    load();
    component.form.controls.name.setValue('   ');
    component.submit();
    http.expectNone('/api/tournaments/5');
  });

  it('updates the correct payload once and navigates on success', () => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.form.setValue({ name: ' Copa nueva ', location: 'Rosario', modality: 'futbol_7', max_teams: 8 });
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(element().querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
    const request = http.expectOne('/api/tournaments/5');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'Copa nueva', location: 'Rosario', modality: 'futbol_7', max_teams: 8, format: 'knockout' });
    http.expectNone((req) => req.method === 'POST');
    expect(navigate).not.toHaveBeenCalled();
    request.flush({ ...tournament, ...request.request.body, rules: 'official_rules_football_7' });
    expect(navigate).toHaveBeenCalledWith(['/tournaments']);
  });

  it('cancels without PUT', async () => {
    load();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    element().querySelector<HTMLAnchorElement>('a')?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0]?.[0].toString()).toBe('/tournaments');
    http.expectNone('/api/tournaments/5');
  });

  it.each([404, 500])('blocks saving after a load error %s', (status) => {
    http.expectOne('/api/tournaments/5').flush({}, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain(status === 404 ? 'No se encontró' : 'No se pudo cargar');
    expect(element().querySelector('form')).toBeNull();
    expect(element().querySelector('a')?.getAttribute('href')).toBe('/tournaments');
    component.submit();
    http.expectNone('/api/tournaments/5');
  });

  it('handles an unavailable backend during loading', () => {
    http.expectOne('/api/tournaments/5').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element().textContent).toContain('No se pudo conectar');
    component.submit();
    http.expectNone('/api/tournaments/5');
  });

  it.each([
    [400, {}, 'no son válidos'],
    [404, {}, 'No se encontró'],
    [409, { message: 'A tournament with the same name already exists in that location' }, 'Ya existe'],
    [409, { message: 'Tournament structure is locked after start: modality' }, 'estado del torneo'],
    [503, {}, 'No se pudo conectar'],
    [500, { message: 'raw database error' }, 'error inesperado'],
  ])('handles update error %s safely and allows retry', (status, body, message) => {
    load();
    component.submit();
    http.expectOne('/api/tournaments/5').flush(body, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(element().textContent).not.toContain('raw database error');
    expect(component.isSaving()).toBe(false);
    component.submit();
    http.expectOne('/api/tournaments/5').flush({}, { status: 500, statusText: 'Error' });
  });

  it.each(['0', '-1', '1.5', 'abc', '2147483648'])('rejects invalid route id %s without GET or PUT', (id) => {
    const pending = http.expectOne('/api/tournaments/5');
    params.next(convertToParamMap({ id }));
    expect(pending.cancelled).toBe(true);
    fixture.detectChanges();
    expect(element().textContent).toContain('identificador del torneo no es válido');
    component.submit();
    http.expectNone((request) => request.method === 'GET' || request.method === 'PUT');
  });

  it.each(['in_progress', 'finished'] as const)('allows only name changes for a %s tournament', (status) => {
    load({ ...tournament, status });
    expect(component.form.controls.location.disabled).toBe(true);
    expect(component.form.controls.modality.disabled).toBe(true);
    expect(component.form.controls.max_teams.disabled).toBe(true);
    expect(element().textContent).toContain('Sólo se puede modificar el nombre');
    component.form.controls.name.setValue('Nuevo nombre');
    component.submit();
    const request = http.expectOne('/api/tournaments/5');
    expect(request.request.body).toEqual({ name: 'Nuevo nombre' });
    request.flush({}, { status: 500, statusText: 'Error' });
  });
});
