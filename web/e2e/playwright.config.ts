import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: '.',
    timeout: 30_000,
    retries: 1,
    use: {
        baseURL: process.env.SANDBOX_URL ?? 'http://127.0.0.1:3006',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'mobile',
            use: {
                ...devices['iPhone 14'],
                hasTouch: true,
            },
        },
        {
            name: 'desktop',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1280, height: 800 },
            },
        },
    ],
})
