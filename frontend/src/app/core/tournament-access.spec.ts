import { canManageTournament } from './tournament-access';
import { AuthenticatedUser } from '../models/auth';
import { Tournament } from '../models/tournament';

const user: AuthenticatedUser = { id: 1, name: 'Owner', email: 'owner@example.test',
  role: 'organizer', created_at: '2026-01-01' };
const tournament: Tournament = { id: 7, organizer_id: 1, name: 'Cup', location: 'Firmat',
  modality: 'futbol_5', max_teams: 4, rules: 'official_rules_football_5', format: 'knockout',
  status: 'open', champion_team_id: null, created_at: '2026-01-01' };

describe('Tournament ownership', () => {
  it('does not allow a visitor or an unloaded tournament', () => {
    expect(canManageTournament(null, tournament)).toBe(false);
    expect(canManageTournament(user, null)).toBe(false);
  });
  it.each([1, 2, null])('organizer can manage owner=%s only when it is their own', organizer_id => {
    expect(canManageTournament(user, { ...tournament, organizer_id })).toBe(organizer_id === 1);
  });
  it.each([1, 2, null])('admin can manage owner=%s, including legacy tournaments', organizer_id => {
    expect(canManageTournament({ ...user, role: 'admin' }, { ...tournament, organizer_id })).toBe(true);
  });
});
