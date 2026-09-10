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
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
    canActivate: [guestOnlyGuard],
    title: 'Create Account',
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
    path: 'matches/:id/result',
    loadComponent: () =>
      import('./features/results/result-entry/result-entry.component').then((m) => m.ResultEntryComponent),
    canActivate: [authGuard, adminGuard],
    data: { fullscreen: true },
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Dashboard',
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  { path: 't/:id', redirectTo: 'tournaments/:id' },
  { path: '**', redirectTo: '' },
];
