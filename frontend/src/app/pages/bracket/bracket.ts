import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnChanges, OnDestroy, OnInit, output, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TeamService } from '../../core/services/team';
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
  round_of_32: 'Dieciseisavos de final',
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
export class Bracket implements OnChanges, OnInit, OnDestroy {
  private readonly teamService = inject(TeamService);
  private logoSubscription = new Subscription();
  private initialized = false;
  readonly bracket = input.required<TournamentBracket>();
  readonly selectedMatchId = input<number | null>(null);
  readonly matchSelected = output<number>();

  protected readonly initialMatchCount = computed(() => this.bracket().tournament.max_teams / 2);
  protected readonly columns = computed<BracketRoundColumn[]>(() => this.buildColumns(this.bracket()));
  protected readonly logoUrls = signal<Record<number, string>>({});

  ngOnChanges(): void {
    if (this.initialized) this.loadTeamLogos();
  }

  ngOnInit(): void {
    this.initialized = true;
    this.loadTeamLogos();
  }

  ngOnDestroy(): void {
    this.clearTeamLogos();
  }

  protected isWinner(match: BracketMatch, team: BracketTeam | null): boolean {
    return team !== null && match.winner_team_id === team.id;
  }

  protected selectMatch(matchId: number): void {
    this.matchSelected.emit(matchId);
  }

  protected teamLogoUrl(team: BracketTeam | null): string | null {
    return team?.has_logo ? this.logoUrls()[team.id] ?? null : null;
  }

  private loadTeamLogos(): void {
    this.clearTeamLogos();
    const ids = new Set<number>();
    for (const round of this.bracket().rounds) {
      for (const match of round.matches) {
        if (match.home_team?.has_logo) ids.add(match.home_team.id);
        if (match.away_team?.has_logo) ids.add(match.away_team.id);
      }
    }
    this.logoSubscription = new Subscription();
    for (const id of ids) {
      this.logoSubscription.add(this.teamService.getLogo(id).subscribe({
        next: blob => {
          const objectUrl = URL.createObjectURL(blob);
          this.logoUrls.update(urls => ({ ...urls, [id]: objectUrl }));
        },
        error: () => undefined,
      }));
    }
  }

  private clearTeamLogos(): void {
    this.logoSubscription.unsubscribe();
    for (const url of Object.values(this.logoUrls())) URL.revokeObjectURL(url);
    this.logoUrls.set({});
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
