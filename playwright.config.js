import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The fixture step must complete before wrangler dev opens the local D1
      // SQLite file — writing to it from a second process while miniflare has
      // it open can drop in-flight connections. See the script's header.
      command: 'node scripts/pickleball/apply-e2e-fixtures.mjs && npx wrangler dev --port 8787 --local',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'static',
      testMatch: /(public-pages|contact-form|image-weight)\.spec\.js/,
      use: { baseURL: 'http://localhost:4173' },
    },
    {
      name: 'worker',
      testMatch: [/admin\.spec\.js/, /pickleball[\\/].*\.spec\.js/],
      use: { baseURL: 'http://localhost:8787' },
    },
    {
      name: 'desktop-safari',
      testMatch: /(public-pages|contact-form|image-weight)\.spec\.js/,
      use: { baseURL: 'http://localhost:4173', ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-safari',
      testMatch: /(public-pages|contact-form|image-weight)\.spec\.js/,
      use: { baseURL: 'http://localhost:4173', ...devices['iPhone 14'] },
    },
  ],
})
