import { Routes } from '@angular/router';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';
import { TournamentForm } from './pages/tournaments/tournament-form/tournament-form';
import { TournamentDetail } from './pages/tournaments/tournament-detail/tournament-detail';
import { TeamList } from './pages/teams/team-list/team-list';
import { TeamForm } from './pages/teams/team-form/team-form';

export const routes: Routes = [
  { path: '', redirectTo: 'tournaments', pathMatch: 'full' },
  { path: 'tournaments/new', component: TournamentForm },
  { path: 'tournaments/:id/edit', component: TournamentForm },
  { path: 'tournaments/:id/teams/new', component: TeamForm },
  { path: 'tournaments/:id/teams', component: TeamList },
  { path: 'tournaments/:id', component: TournamentDetail },
  { path: 'tournaments', component: TournamentList },
];
