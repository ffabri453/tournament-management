export const TOURNAMENT_LOCATIONS = [
  'Firmat',
  'Venado Tuerto',
  'Rosario',
  'Elortondo'
] as const;

export const TOURNAMENT_MODALITIES = [
  'futbol_5',
  'futbol_7',
  'futbol_11'
] as const;

export const TOURNAMENT_CAPACITIES = [4, 8, 16, 32] as const;
export const TOURNAMENT_STATUSES = ['open', 'in_progress', 'finished'] as const;
export const MATCH_STATUSES = ['scheduled', 'live', 'finished', 'suspended'] as const;
export const MATCH_ROUNDS = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'final'
] as const;

export type TournamentLocation = typeof TOURNAMENT_LOCATIONS[number];
export type TournamentModality = typeof TOURNAMENT_MODALITIES[number];
export type TournamentCapacity = typeof TOURNAMENT_CAPACITIES[number];
export type TournamentStatus = typeof TOURNAMENT_STATUSES[number];
export type MatchStatus = typeof MATCH_STATUSES[number];
export type MatchRound = typeof MATCH_ROUNDS[number];

export const RULES_BY_MODALITY: Record<TournamentModality, string> = {
  futbol_5: 'official_rules_football_5',
  futbol_7: 'official_rules_football_7',
  futbol_11: 'official_rules_football_11'
};

export const PLAYER_LIMITS: Record<
  TournamentModality,
  { min: number; max: number }
> = {
  futbol_5: { min: 5, max: 10 },
  futbol_7: { min: 7, max: 14 },
  futbol_11: { min: 11, max: 22 }
};

export const ROUNDS_BY_CAPACITY: Record<TournamentCapacity, MatchRound[]> = {
  4: ['semi_final', 'final'],
  8: ['quarter_final', 'semi_final', 'final'],
  16: ['round_of_16', 'quarter_final', 'semi_final', 'final'],
  32: ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final']
};

export const INITIAL_ROUND_BY_CAPACITY: Record<TournamentCapacity, MatchRound> = {
  4: 'semi_final',
  8: 'quarter_final',
  16: 'round_of_16',
  32: 'round_of_32'
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const isPositiveInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
};

export const isNonNumericName = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  return trimmed.length > 0 && !/^\d+(?:[.,]\d+)?$/.test(trimmed);
};

export const parseMatchDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  const localMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(trimmed);

  if (localMatch) {
    const [, yearText, monthText, dayText, hourText, minuteText] = localMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    if (
      month < 1 || month > 12 ||
      day < 1 || day > daysInMonth ||
      hour < 0 || hour > 23 ||
      minute < 0 || minute > 59
    ) {
      return null;
    }

    return new Date(
      `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:00-03:00`
    );
  }

  const isoDate = new Date(trimmed);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
};

export const hasOnlyFields = (
  body: Record<string, unknown>,
  fields: readonly string[]
): string[] => Object.keys(body).filter((field) => !fields.includes(field));

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
