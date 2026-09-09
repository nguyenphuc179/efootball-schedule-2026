# Routing Architecture

All routes are declared in `src/app/app.routes.ts` and use `loadComponent`/`loadChildren` for
per-feature code splitting. Guards are functional (`CanActivateFn`), matching Angular 20 style.

```
/                              → HomeComponent                      (public)
/login                         → LoginComponent                     (public, guest-only redirect if signed in)
/register                      → RegisterComponent                  (public)

/tournaments                   → TournamentListComponent            (public)
/tournaments/create            → TournamentFormComponent            (admin only)
/tournaments/:id               → TournamentDetailComponent          (public)  — tabbed:
    ?tab=overview  | teams | fixtures | results | standings | statistics
/tournaments/:id/edit          → TournamentFormComponent            (admin only)
/tournaments/:id/teams/create  → TeamFormComponent (full-screen)     (admin only)
/tournaments/:id/teams/:teamId/edit → TeamFormComponent              (admin only)
/tournaments/:id/checkin       → CheckinComponent                   (admin / team manager)
/tournaments/:id/checkin/:teamId/qr → TeamQrComponent                (admin / team manager)

/matches                       → MatchesComponent (cross-tournament) (public)
/matches/:id/result            → ResultEntryComponent                (admin only)

/standings                     → StandingsOverviewComponent          (public, tournament picker)

/dashboard                     → DashboardComponent                  (admin only)

/notifications                 → NotificationsComponent              (auth required)
/profile                       → ProfileComponent                    (auth required)

/t/:id                         → short-link redirect target for QR codes → redirects to /tournaments/:id
/checkin/:teamId                → deep-link target for team QR scan → CheckinComponent (prefilled)

**                              → NotFoundComponent (redirect to /)
```

## Route table (excerpt)

```ts
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent) },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'tournaments',
    children: [
      { path: '', loadComponent: () => import('./features/tournament/tournament-list/tournament-list.component').then(m => m.TournamentListComponent) },
      { path: 'create', loadComponent: () => import('./features/tournament/tournament-form/tournament-form.component').then(m => m.TournamentFormComponent), canActivate: [authGuard, adminGuard] },
      { path: ':id', loadComponent: () => import('./features/tournament/tournament-detail/tournament-detail.component').then(m => m.TournamentDetailComponent) },
      { path: ':id/edit', loadComponent: () => import('./features/tournament/tournament-form/tournament-form.component').then(m => m.TournamentFormComponent), canActivate: [authGuard, adminGuard] },
      { path: ':id/teams/create', loadComponent: () => import('./features/teams/team-form/team-form.component').then(m => m.TeamFormComponent), canActivate: [authGuard, adminGuard] },
      { path: ':id/teams/:teamId/edit', loadComponent: () => import('./features/teams/team-form/team-form.component').then(m => m.TeamFormComponent), canActivate: [authGuard, adminGuard] },
      { path: ':id/checkin', loadComponent: () => import('./features/checkin/checkin.component').then(m => m.CheckinComponent), canActivate: [authGuard] },
      { path: ':id/checkin/:teamId/qr', loadComponent: () => import('./features/checkin/team-qr/team-qr.component').then(m => m.TeamQrComponent), canActivate: [authGuard] },
    ],
  },
  { path: 'matches', loadComponent: () => import('./features/fixtures/fixtures-list/fixtures-list.component').then(m => m.FixturesListComponent) },
  { path: 'matches/:id/result', loadComponent: () => import('./features/results/result-entry/result-entry.component').then(m => m.ResultEntryComponent), canActivate: [authGuard, adminGuard] },
  { path: 'standings', loadComponent: () => import('./features/standings/standings-view/standings-view.component').then(m => m.StandingsViewComponent) },
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [authGuard, adminGuard] },
  { path: 'notifications', loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent), canActivate: [authGuard] },
  { path: 'profile', loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent), canActivate: [authGuard] },
  { path: 't/:id', redirectTo: 'tournaments/:id' },
  { path: 'checkin/:teamId', loadComponent: () => import('./features/checkin/checkin.component').then(m => m.CheckinComponent) },
  { path: '**', redirectTo: '' },
];
```

## Guards

* **`authGuard`** — redirects to `/login` (preserving `returnUrl`) if `AuthService.user()` is null.
* **`adminGuard`** — redirects to `/` with a snackbar if the signed-in user's role isn't `admin`.
* **`guestOnlyGuard`** — redirects `/login`/`/register` to `/` if already signed in (better mobile UX
  than showing a login form to a logged-in user).

## Bottom navigation ↔ routes mapping

| Tab | Route | Icon |
|---|---|---|
| Home | `/` | `home` |
| Tournaments | `/tournaments` | `emoji_events` |
| Matches | `/matches` | `sports_soccer` |
| Standings | `/standings` | `leaderboard` |
| Profile | `/profile` (or `/login` if guest) | `person` |

The bottom nav is rendered by the app shell (`app.component.ts`) outside the router-outlet and stays
mounted across navigations — only the outlet content changes — so tab switches feel instant (no nav
re-render, matches the native-app feel Sofascore/OneFootball have).
