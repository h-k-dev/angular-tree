import { Routes } from '@angular/router';

export const routes: Routes = [
  // Everything lazy — the shell's initial chunk is navigation + theme only.
  // The playground is a layout (examples aside + outlet); each example is its
  // own child route and chunk. Documents stays the front page.
  {
    path: '',
    loadComponent: () => import('./playground/playground').then((m) => m.Playground),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./documents-example/documents-example').then((m) => m.DocumentsExample),
      },
      {
        path: 'resource',
        loadComponent: () => import('./resource-example/resource-example').then((m) => m.ResourceExample),
      },
      {
        path: 'static',
        loadComponent: () => import('./static-example/static-example').then((m) => m.StaticExample),
      },
      {
        path: 'vscode',
        loadComponent: () => import('./vscode-example/vscode-example').then((m) => m.VscodeExample),
      },
    ],
  },
  {
    path: 'api',
    loadComponent: () => import('./api-reference/api-reference').then((m) => m.ApiReference),
  },
  { path: '**', redirectTo: '' },
];
