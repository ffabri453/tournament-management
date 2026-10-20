import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatchRound } from '../../models/match';
import { BracketMatch, BracketTeam, Tournament, TournamentBracket } from '../../models/tournament';

interface BracketSlot {
  match: BracketMatch | null;
  gridRow: string;
  span: number;
  hasNextRound: boolean;
  connectsForward: boolean;
}

interface BracketRoundColumn {
  round: MatchRound;
  label: string;
  slots: BracketSlot[];
}

const roundsByCapacity: Record<Tournament['max_teams'], MatchRound[]> = {
  4: ['semi_final', 'final'],
  8: ['quarter_final', 'semi_final', 'final'],
  16: ['round_of_16', 'quarter_final', 'semi_final', 'final'],
  32: ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final'],
};

const roundLabels: Record<MatchRound, string> = {
  round_of_32: '32avos de final',
  round_of_16: 'Octavos de final',
  quarter_final: 'Cuartos de final',
  semi_final: 'Semifinales',
  final: 'Final',
};

@Component({
  selector: 'app-bracket',
  imports: [DatePipe],
  templateUrl: './bracket.html',
  styleUrl: './bracket.css',
})
export class Bracket {
  readonly bracket = input.required<TournamentBracket>();
  readonly selectedMatchId = input<number | null>(null);
  readonly matchSelected = output<number>();

  protected readonly initialMatchCount = computed(() => this.bracket().tournament.max_teams / 2);
  protected readonly columns = computed<BracketRoundColumn[]>(() => this.buildColumns(this.bracket()));

  protected isWinner(match: BracketMatch, team: BracketTeam | null): boolean {
    return team !== null && match.winner_team_id === team.id;
  }

  protected selectMatch(matchId: number): void {
    this.matchSelected.emit(matchId);
  }

  protected teamLogoUrl(teamId: number): string {
    return `/api/teams/${teamId}/logo`;
  }

  private buildColumns(bracket: TournamentBracket): BracketRoundColumn[] {
    const rounds = roundsByCapacity[bracket.tournament.max_teams];
    const matchesByRound = new Map(bracket.rounds.map(item => [item.round, item.matches]));
    return rounds.map((round, roundIndex) => {
      const expectedMatches = bracket.tournament.max_teams / (2 ** (roundIndex + 1));
      const existingMatches = matchesByRound.get(round) ?? [];
      const slotCount = Math.max(expectedMatches, existingMatches.length);
      const span = 2 ** roundIndex;
      return {
        round,
        label: roundLabels[round],
        slots: Array.from({ length: slotCount }, (_, index) => ({
          match: existingMatches[index] ?? null,
          gridRow: `${index * span + 1} / span ${span}`,
          span,
          hasNextRound: roundIndex < rounds.length - 1,
          connectsForward: roundIndex < rounds.length - 1 && index % 2 === 0 && index + 1 < slotCount,
        })),
      };
    });
  }
}
