import { Routes } from '@angular/router';

export const routes: Routes = [
  // Both pages lazy — the shell's initial chunk is navigation + theme only.
  { path: '', loadComponent: () => import('./playground/playground').then((m) => m.Playground) },
  {
    path: 'api',
    loadComponent: () => import('./api-reference/api-reference').then((m) => m.ApiReference),
  },
  { path: '**', redirectTo: '' },
];
