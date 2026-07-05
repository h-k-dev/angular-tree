import { defineConfig } from '@playwright/test';

/**
 * Phase 8 browser integration matrix (ROADMAP.md) — the verifications jsdom
 * can't do: real focus traps, CDK overlay stacking, virtualized-edge ARIA,
 * RTL keyboard mirroring, and the 100k perf run against a real renderer.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    // 127.0.0.1, not localhost: Node prefers ::1 for localhost, but dev
    // servers (and the CI static server) may bind IPv4 only — the mismatch
    // makes webServer spawn a duplicate instead of reusing.
    // 4201, not 4200: with reuseExistingServer an unrelated dev server
    // squatting on the default Angular port would get tested instead.
    baseURL: 'http://127.0.0.1:4201',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm start -- --port 4201',
    url: 'http://127.0.0.1:4201',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
