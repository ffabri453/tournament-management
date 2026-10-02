import { Routes } from '@angular/router';
import { TournamentForm } from './pages/tournaments/tournament-form/tournament-form';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';

export const routes: Routes = [
  { path: '', redirectTo: 'tournaments', pathMatch: 'full' },
  { path: 'tournaments/new', component: TournamentForm },
  { path: 'tournaments', component: TournamentList },
];
