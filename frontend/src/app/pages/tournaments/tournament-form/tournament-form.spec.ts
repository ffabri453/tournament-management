import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TournamentForm } from './tournament-form';

describe('TournamentForm', () => {
  let component: TournamentForm;
  let fixture: ComponentFixture<TournamentForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentForm],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
