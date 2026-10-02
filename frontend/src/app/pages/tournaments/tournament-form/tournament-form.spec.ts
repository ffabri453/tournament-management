import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TournamentForm } from './tournament-form';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormControl } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';

describe('TournamentForm', () => {
  let component: TournamentForm;
  let fixture: ComponentFixture<TournamentForm>;
  let http: HttpTestingController;
  const fillForm = () => component.form.setValue({ name: ' Copa Regional ', location: 'Firmat', modality: 'futbol_7', max_teams: 8 });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentForm);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });
  afterEach(() => http.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not POST an invalid form and shows validation messages', () => {
    component.submit();
    http.expectNone('/api/tournaments');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ingresá un nombre válido');
  });

  it.each(['   ', '123', '-1.5e2', 'a'.repeat(101), 'Copa\0'])('rejects invalid name %s', (name) => {
    fillForm();
    component.form.controls.name.setValue(name);
    component.submit();
    http.expectNone('/api/tournaments');
    expect(component.form.controls.name.invalid).toBe(true);
  });

  it('validates location, modality and capacity against the domain', () => {
    expect(component.form.controls.location.validator?.(new FormControl('Otra'))).toEqual({ option: true });
    expect(component.form.controls.modality.validator?.(new FormControl('tenis'))).toEqual({ option: true });
    expect(component.form.controls.max_teams.validator?.(new FormControl(6))).toEqual({ option: true });
  });

  it.each([
    ['futbol_5', 'official_rules_football_5'],
    ['futbol_7', 'official_rules_football_7'],
    ['futbol_11', 'official_rules_football_11'],
  ] as const)('POSTs a valid form with rules for %s and navigates after 201', (modality, rules) => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fillForm();
    component.form.controls.modality.setValue(modality);
    component.submit();
    const request = http.expectOne('/api/tournaments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Copa Regional', location: 'Firmat', modality, max_teams: 8, rules, format: 'knockout' });
    expect(navigate).not.toHaveBeenCalled();
    request.flush({ ...request.request.body, id: 1, status: 'open', champion_team_id: null, created_at: '2026-10-02T12:00:00.000Z' }, { status: 201, statusText: 'Created' });
    expect(navigate).toHaveBeenCalledWith(['/tournaments']);
  });

  it('prevents duplicate submissions while saving', () => {
    fillForm();
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(component.isSaving()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Guardando torneo');
    http.expectOne('/api/tournaments').flush({}, { status: 500, statusText: 'Server error' });
  });

  it('cancels without POST', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a')?.click();
    await fixture.whenStable();
    expect(navigate.mock.calls[0]?.[0].toString()).toBe('/tournaments');
    expect((fixture.nativeElement as HTMLElement).querySelector('a')?.getAttribute('href')).toBe('/tournaments');
    http.expectNone('/api/tournaments');
  });

  it.each([
    [400, { message: 'Invalid tournament data', errors: ['name is required'] }, 'no son válidos'],
    [409, { message: 'A tournament with the same name already exists in that location' }, 'Ya existe'],
    [503, {}, 'conectar con el servidor'],
    [500, { message: 'raw database error' }, 'error inesperado'],
  ])('shows a safe message for HTTP %s and allows retry', (status, body, message) => {
    fillForm();
    component.submit();
    http.expectOne('/api/tournaments').flush(body, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(component.isSaving()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(component.errorMessage()).not.toContain('raw database error');
    component.submit();
    http.expectOne('/api/tournaments').flush({}, { status: 500, statusText: 'Server error' });
  });

  it('shows a connection error', () => {
    fillForm();
    component.submit();
    http.expectOne('/api/tournaments').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('conectar con el servidor');
  });
});
