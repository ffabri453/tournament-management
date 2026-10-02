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
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not submit an invalid form and marks its controls as touched', () => {
    component.submit();

    expect(tournamentService.create).not.toHaveBeenCalled();
    expect(component['tournamentForm'].touched).toBe(true);
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

    component.submit();
    component.submit();

    expect(tournamentService.create).toHaveBeenCalledOnce();
    expect(tournamentService.create).toHaveBeenCalledWith({
      name: 'Liga regional',
      location: 'Firmat',
      modality: 'futbol_7',
      max_teams: 8,
    });
    expect(component['isLoading']()).toBe(true);

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

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component['errorMessage']()).toBe('No se pudo crear el torneo.');
    expect(component['isLoading']()).toBe(false);
  });
});
