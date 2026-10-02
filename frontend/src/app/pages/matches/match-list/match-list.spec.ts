import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatchList } from './match-list';

describe('MatchList', () => {
  let component: MatchList;
  let fixture: ComponentFixture<MatchList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchList],
    }).compileComponents();

    fixture = TestBed.createComponent(MatchList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
