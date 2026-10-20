import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchRound } from '../../models/match';
import { BracketMatch, Tournament, TournamentBracket } from '../../models/tournament';
import { Bracket } from './bracket';

describe('Bracket', () => {
  let fixture: ComponentFixture<Bracket>;
  let element: HTMLElement;

  const tournament = (maxTeams: Tournament['max_teams'] = 8): Tournament => ({
    id: 7,
    name: 'Copa de Clubes Regionales',
    location: 'Firmat',
    modality: 'futbol_7',
    max_teams: maxTeams,
    rules: 'official_rules_football_7',
    format: 'knockout',
    status: 'in_progress',
    champion_team_id: null,
    created_at: '2026-10-19T12:00:00.000Z',
  });

  const match = (id: number, round: MatchRound, finished = false): BracketMatch => {
    const homeId = id * 2 - 1;
    const awayId = id * 2;
    return {
      id,
      tournament_id: 7,
      home_team_id: homeId,
      away_team_id: awayId,
      match_date: '2026-10-31T18:00:00.000Z',
      location: 'Cancha Central',
      round,
      home_goals: finished ? 2 : null,
      away_goals: finished ? 1 : null,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: finished ? homeId : null,
      status: finished ? 'finished' : 'scheduled',
      created_at: '2026-10-19T12:00:00.000Z',
      home_team: { id: homeId, name: `Club Deportivo Regional del Norte ${homeId}` },
      away_team: { id: awayId, name: `Asociación Atlética del Sur ${awayId}` },
      winner_team: finished ? { id: homeId, name: `Club Deportivo Regional del Norte ${homeId}` } : null,
    };
  };

  const response = (maxTeams: Tournament['max_teams'], rounds: TournamentBracket['rounds']): TournamentBracket => ({
    tournament: { ...tournament(maxTeams), champion: null },
    rounds,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Bracket] }).compileComponents();
    fixture = TestBed.createComponent(Bracket);
    element = fixture.nativeElement as HTMLElement;
  });

  const render = (bracket: TournamentBracket, selectedMatchId: number | null = null) => {
    fixture.componentRef.setInput('bracket', bracket);
    fixture.componentRef.setInput('selectedMatchId', selectedMatchId);
    fixture.detectChanges();
  };

  it.each([
    [4, 'semi_final'],
    [8, 'quarter_final'],
    [16, 'round_of_16'],
    [32, 'round_of_32'],
  ] as const)('builds every round and expected slot for a %i-team tournament', (capacity, firstRound) => {
    const firstMatches = Array.from({ length: capacity / 2 }, (_, index) => match(index + 1, firstRound));
    render(response(capacity, [{ round: firstRound, matches: firstMatches }]));
    expect(element.querySelectorAll('.round')).toHaveLength(Math.log2(capacity));
    expect(element.querySelectorAll('.match-card')).toHaveLength(capacity - 1);
    expect(element.querySelectorAll('.pending')).toHaveLength(capacity / 2 - 1);
    expect(element.querySelectorAll('.crest-slot')).toHaveLength((capacity - 1) * 2);
  });

  it('shows full names, goals, penalties and the winner without abbreviating', () => {
    const penaltyMatch = { ...match(1, 'semi_final', true), home_goals: 2, away_goals: 2,
      home_penalties: 5, away_penalties: 4 };
    render(response(4, [
      { round: 'semi_final', matches: [penaltyMatch, match(2, 'semi_final', true)] },
      { round: 'final', matches: [match(3, 'final')] },
    ]));
    const text = element.textContent ?? '';
    expect(text).toContain('Club Deportivo Regional del Norte 1');
    expect(text).toContain('Asociación Atlética del Sur 2');
    expect(text).toContain('(5)');
    expect(text).toContain('(4)');
    expect(text).not.toContain('Club Dep.');
    expect(element.querySelector('.team.winner .team-name')?.textContent).toBe('Club Deportivo Regional del Norte 1');
    expect(element.querySelector('.team.loser .team-name')?.textContent).toBe('Asociación Atlética del Sur 2');
  });

  it('shows the real match ID and scheduled date in the compact header', () => {
    const scheduled = match(27, 'semi_final');
    render(response(4, [{ round: 'semi_final', matches: [scheduled] }]));
    const header = element.querySelector('button.match-card .match-card-header');
    expect(header?.textContent).toContain('Partido #27');
    expect(header?.querySelector('time')?.getAttribute('datetime')).toBe(scheduled.match_date);
    expect(header?.querySelector('time')?.textContent).toMatch(/\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}/);
  });

  it('renders future rounds as connected pending slots without inventing teams', () => {
    const firstRound = Array.from({ length: 4 }, (_, index) => match(index + 1, 'quarter_final'));
    render(response(8, [{ round: 'quarter_final', matches: firstRound }]));
    expect(element.querySelectorAll('.pending')).toHaveLength(3);
    for (const name of element.querySelectorAll('.pending .team-name')) expect(name.textContent).toBe('Por definir');
    expect(element.querySelectorAll('.connector')).toHaveLength(3);
    expect(element.querySelectorAll('.round:last-child .has-next-round')).toHaveLength(0);
    expect(element.textContent).not.toContain('Equipo #');
  });

  it('emits the selected real match and displays its selected state', () => {
    const selected = vi.fn();
    fixture.componentInstance.matchSelected.subscribe(selected);
    render(response(4, [{ round: 'semi_final', matches: [match(1, 'semi_final'), match(2, 'semi_final')] }]), 2);
    const cards = element.querySelectorAll<HTMLButtonElement>('button.match-card');
    expect(cards[1]?.getAttribute('aria-pressed')).toBe('true');
    cards[0]?.click();
    expect(selected).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('shows the champion name returned by the backend', () => {
    const bracket = response(4, [{ round: 'final', matches: [match(3, 'final', true)] }]);
    bracket.tournament = { ...bracket.tournament, status: 'finished', champion_team_id: 5,
      champion: { id: 5, name: 'Club Social y Deportivo Campeón Nacional' } };
    render(bracket);
    expect(element.querySelector('.champion')?.textContent).toContain('Club Social y Deportivo Campeón Nacional');
  });

  it('shows an empty state when the backend returns no rounds', () => {
    render(response(8, []));
    expect(element.querySelector('[role="status"]')?.textContent).toContain('no hay partidos para mostrar');
    expect(element.querySelector('.bracket-grid')).toBeNull();
  });
});
