import { authGuard } from './core/auth.guard';
import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';
import { TournamentForm } from './pages/tournaments/tournament-form/tournament-form';
import { TournamentDetail } from './pages/tournaments/tournament-detail/tournament-detail';
import { TeamList } from './pages/teams/team-list/team-list';
import { TeamForm } from './pages/teams/team-form/team-form';
import { MatchList } from './pages/matches/match-list/match-list';
import { Home } from './pages/home/home';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: '', component: Home, pathMatch: 'full' },
  { path: 'tournaments/new', component: TournamentForm, canActivate: [authGuard] },
  { path: 'tournaments/:id/edit', component: TournamentForm, canActivate: [authGuard] },
  { path: 'tournaments/:id/teams/new', component: TeamForm, canActivate: [authGuard] },
  { path: 'tournaments/:id/teams/:teamId/edit', component: TeamForm, canActivate: [authGuard] },
  { path: 'tournaments/:id/teams', component: TeamList },
  { path: 'tournaments/:id/matches', component: MatchList },
  { path: 'tournaments/:id/bracket', component: MatchList },
  { path: 'tournaments/:id', component: TournamentDetail },
  { path: 'tournaments', component: TournamentList },
];
