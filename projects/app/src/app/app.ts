import {
  Component,
  DestroyRef,
  DOCUMENT,
  inject,

  // Signals
  signal,
  computed,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';

/** App shell: top-bar navigation (Playground / API) + theme. Pages own the rest. */
@Component({
  selector: '[app-root]',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,

    // Material
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[class.dark-mode]': "theme() === 'dark'",
  },
})
export class App {
  readonly #document = inject(DOCUMENT);
  readonly #window = this.#document.defaultView;
  readonly #destroyRef = inject(DestroyRef);

  // 1. Check system preference on initialization (SSR safe)
  theme = signal<'light' | 'dark'>(
    this.#window?.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );

  themeClass = computed(() => `${this.theme()}-mode`);

  constructor() {
    // 2. Listen for system theme changes in real-time
    const mediaQuery = this.#window?.matchMedia?.(
      '(prefers-color-scheme: dark)',
    );

    if (mediaQuery) {
      const themeChangeListener = (e: MediaQueryListEvent) => {
        // Update the signal when the OS theme changes
        this.theme.set(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', themeChangeListener);

      // Clean up the listener when the component is destroyed
      this.#destroyRef.onDestroy(() => {
        mediaQuery.removeEventListener('change', themeChangeListener);
      });
    }
  }

  toggleTheme() {
    if (this.#document.startViewTransition) {
      this.#document.startViewTransition(() => {
        this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
      });
      return;
    }

    this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
  }
}
