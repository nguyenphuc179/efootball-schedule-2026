import { Routes } from '@angular/router';
import { authGuard, guestOnlyGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
    title: 'PitchPro — Home',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guestOnlyGuard],
    title: 'Sign In',
    data: { fullscreen: true },
  },
  {
    path: 'tournaments',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/tournament/tournament-list/tournament-list.component').then(
            (m) => m.TournamentListComponent
          ),
      },
      {
        path: 'create',
        loadComponent: () =>
          import('./features/tournament/tournament-form/tournament-form.component').then(
            (m) => m.TournamentFormComponent
          ),
        canActivate: [authGuard, adminGuard],
        data: { fullscreen: true },
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/tournament/tournament-detail/tournament-detail.component').then(
            (m) => m.TournamentDetailComponent
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/tournament/tournament-form/tournament-form.component').then(
            (m) => m.TournamentFormComponent
          ),
        canActivate: [authGuard, adminGuard],
        data: { fullscreen: true },
      },
    ],
  },
  {
    path: 'hall-of-fame',
    loadComponent: () =>
      import('./features/hall-of-fame/hall-of-fame.component').then((m) => m.HallOfFameComponent),
    title: 'Hall of Fame',
  },
  {
    path: 'ranking',
    loadComponent: () => import('./features/ranking/ranking.component').then((m) => m.RankingComponent),
    title: 'Ranking',
  },
  {
    path: 'matches/:id/result',
    loadComponent: () =>
      import('./features/results/result-entry/result-entry.component').then((m) => m.ResultEntryComponent),
    canActivate: [authGuard, adminGuard],
    data: { fullscreen: true },
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./features/activity-log/activity-log.component').then((m) => m.ActivityLogComponent),
    // Any signed-in member, not just admins — an admin sees the full "/history" audit trail, a
    // regular member sees only their own personal feed (see ActivityLogComponent/getMine()).
    canActivate: [authGuard],
  },
  {
    path: 'polls',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/polls/poll-list/poll-list.component').then((m) => m.PollListComponent),
        title: 'Polls',
      },
      {
        path: 'create',
        loadComponent: () => import('./features/polls/poll-form/poll-form.component').then((m) => m.PollFormComponent),
        canActivate: [adminGuard],
        data: { fullscreen: true },
      },
      {
        path: ':id',
        loadComponent: () => import('./features/polls/poll-detail/poll-detail.component').then((m) => m.PollDetailComponent),
      },
    ],
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  { path: 't/:id', redirectTo: 'tournaments/:id' },
  { path: '**', redirectTo: '' },
];
