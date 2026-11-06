import { AuthenticatedUser } from '../models/auth';
import { Tournament } from '../models/tournament';

export function canManageTournament(
  user: AuthenticatedUser | null,
  tournament: Tournament | null,
): boolean {
  return user !== null && tournament !== null &&
    (user.role === 'admin' || (user.role === 'organizer' && tournament.organizer_id === user.id));
}
