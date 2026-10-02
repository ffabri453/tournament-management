import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, throwError } from 'rxjs';

import { TournamentService } from '../../../core/services/tournament.service';
import { Tournament } from '../../../models/tournament';
import { TournamentForm } from './tournament-form';

describe('TournamentForm', () => {
  let component: TournamentForm;
  let fixture: ComponentFixture<TournamentForm>;
  let element: HTMLElement;
  const tournamentService = { create: vi.fn() };
  const router = { navigate: vi.fn() };
  const createdTournament: Tournament = {
    id: 1,
    name: 'Liga regional',
    location: 'Firmat',
    rules: 'official_rules_football_7',
    format: 'knockout',
    modality: 'futbol_7',
    max_teams: 8,
    status: 'open',
    champion_team_id: null,
    created_at: '2026-10-02T12:00:00.000Z',
  };

  beforeEach(async () => {
    tournamentService.create.mockReset();
    router.navigate.mockReset();

    await TestBed.configureTestingModule({
      imports: [TournamentForm],
      providers: [
        { provide: TournamentService, useValue: tournamentService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentForm);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the reactive form fields and their available options', () => {
    expect(component).toBeTruthy();
    expect(element.querySelector('h1')?.textContent).toContain('Crear torneo');
    expect(element.querySelector('input[formControlName="name"]')).not.toBeNull();
    expect(element.querySelectorAll('select[formControlName="location"] option')).toHaveLength(5);
    expect(element.querySelectorAll('select[formControlName="modality"] option')).toHaveLength(4);
    expect(element.querySelectorAll('select[formControlName="max_teams"] option')).toHaveLength(5);
  });

  it('does not submit an invalid form and marks its controls as touched', () => {
    component.submit();
    fixture.detectChanges();

    expect(tournamentService.create).not.toHaveBeenCalled();
    expect(component['tournamentForm'].touched).toBe(true);
    expect(element.textContent).toContain('El nombre es obligatorio.');
    expect(element.textContent).toContain('La localidad es obligatoria.');
    expect(element.textContent).toContain('La modalidad es obligatoria.');
    expect(element.textContent).toContain('La cantidad máxima de equipos es obligatoria.');
  });

  it('submits the user fields once and navigates after creation succeeds', () => {
    const response = new Subject<Tournament>();
    tournamentService.create.mockReturnValue(response.asObservable());
    component['tournamentForm'].setValue({
      name: 'Liga regional',
      location: 'Firmat',
      modality: 'futbol_7',
      max_teams: 8,
    });

    fixture.detectChanges();
    const form = element.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(tournamentService.create).toHaveBeenCalledOnce();
    expect(tournamentService.create).toHaveBeenCalledWith({
      name: 'Liga regional',
      location: 'Firmat',
      modality: 'futbol_7',
      max_teams: 8,
    });
    expect(component['isLoading']()).toBe(true);
    expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Creando...');
    expect((element.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);

    response.next(createdTournament);
    response.complete();

    expect(router.navigate).toHaveBeenCalledWith(['/tournaments']);
    expect(component['isLoading']()).toBe(false);
  });

  it('stays in the form and exposes an error when creation fails', () => {
    tournamentService.create.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 500,
      statusText: 'Server error',
    })));
    component['tournamentForm'].setValue({
      name: 'Liga regional',
      location: 'Rosario',
      modality: 'futbol_11',
      max_teams: 16,
    });

    component.submit();
    fixture.detectChanges();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component['errorMessage']()).toBe('No se pudo crear el torneo.');
    expect(element.textContent).toContain('No se pudo crear el torneo.');
    expect(component['isLoading']()).toBe(false);
  });

  it('navigates back to the tournament list when cancel is clicked', () => {
    (element.querySelector('button[type="button"]') as HTMLButtonElement).click();

    expect(router.navigate).toHaveBeenCalledWith(['/tournaments']);
    expect(tournamentService.create).not.toHaveBeenCalled();
  });
});
