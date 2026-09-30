import { Routes } from '@angular/router';
import { TournamentList } from './pages/tournaments/tournament-list/tournament-list';

export const routes: Routes = [
  { path: '', redirectTo: 'tournaments', pathMatch: 'full' },
  { path: 'tournaments', component: TournamentList },
];
