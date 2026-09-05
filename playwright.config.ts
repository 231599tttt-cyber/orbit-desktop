import { defineConfig } from '@playwright/test'

const isContinuousIntegration = Boolean(process.env.CI)

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results/artifacts',
  fullyParallel: false,
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 1 : 0,
  workers: isContinuousIntegration ? 1 : undefined,
  reporter: isContinuousIntegration
    ? [['line'], ['html', { open: 'never', outputFolder: 'test-results/report' }]]
    : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'unit',
      testMatch: /unit\/.*\.spec\.ts/,
    },
    {
      name: 'electron',
      testMatch: /e2e\/.*\.spec\.ts/,
      workers: 1,
    },
  ],
  webServer: {
    command: 'npm exec vite -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: !isContinuousIntegration,
    timeout: 60_000,
  },
})
