import { DomainError } from './competitionRules';
import { User } from '../models/User';

export type TournamentActor = Pick<User, 'id' | 'role'>;

export const assertAuthenticatedActor = (actor: TournamentActor): void => {
  if (!actor || !Number.isInteger(actor.id) || actor.id <= 0 ||
      !['admin', 'organizer'].includes(actor.role)) {
    throw new DomainError('AUTHENTICATION_REQUIRED', 'Authentication required');
  }
};

export const assertTournamentManager = (
  organizerId: number | null | undefined,
  actor: TournamentActor
): void => {
  assertAuthenticatedActor(actor);
  if (actor.role === 'admin' || (actor.role === 'organizer' && organizerId === actor.id)) return;
  throw new DomainError('TOURNAMENT_ACCESS_DENIED', 'You cannot manage this tournament');
};
