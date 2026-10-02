import { Routes } from '@angular/router';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';
import { TournamentForm } from './pages/tournaments/tournament-form/tournament-form';

export const routes: Routes = [
  { path: '', redirectTo: 'tournaments', pathMatch: 'full' },
  { path: 'tournaments/new', component: TournamentForm },
  { path: 'tournaments/:id/edit', component: TournamentForm },
  { path: 'tournaments', component: TournamentList },
];
