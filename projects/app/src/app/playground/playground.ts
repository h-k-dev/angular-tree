import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/**
 * The playground layout: a left aside listing every example, the active one
 * rendered in the outlet. Examples are child routes so each stays its own
 * lazy chunk and is deep-linkable; the Documents example is the front page.
 */
@Component({
  selector: 'app-playground',
  imports: [MatIconModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './playground.html',
  styleUrl: './playground.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class Playground {
  /** The aside's example list — grows with each new example page. */
  readonly examples = [
    { path: '/', icon: 'folder_managed', label: 'All-In-1' },
    { path: '/resource', icon: 'cloud_download', label: 'Resource API' },
    { path: '/static', icon: 'layers', label: 'Static' },
    { path: '/vscode', icon: 'code', label: 'VS Code' },
    { path: '/lazy', icon: 'cloud_sync', label: 'Lazy Load Only' },
    { path: '/media', icon: 'play_circle', label: 'Media' },
  ];
}
