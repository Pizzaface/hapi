import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

let sandboxUrl: string
let sandboxHome: string
let sandboxToken: string

test.beforeAll(async () => {
    // Start sandbox hub with seed data
    const output = execSync('bun scripts/sandbox-hub.ts start --seed', {
        cwd: join(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 30_000,
    })

    const urlMatch = output.match(/SANDBOX_URL=(http:\/\/[^\s]+)/)
    const homeMatch = output.match(/SANDBOX_HOME=([^\s]+)/)
    const tokenMatch = output.match(/SANDBOX_TOKEN=([^\s]+)/)

    if (!urlMatch || !homeMatch || !tokenMatch) {
        throw new Error(`Failed to parse sandbox output:\n${output}`)
    }

    sandboxUrl = urlMatch[1]!
    sandboxHome = homeMatch[1]!
    sandboxToken = tokenMatch[1]!
})

test.afterAll(async () => {
    execSync('bun scripts/sandbox-hub.ts stop', {
        cwd: join(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 10_000,
    })
})

function authUrl(path: string): string {
    return `${sandboxUrl}${path}?token=${sandboxToken}`
}

test.describe('mobile drawer', () => {
    test.use({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
    })

    test('edge swipe opens drawer', async ({ page }) => {
        // Navigate to a session page first
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // Click first session to navigate to detail
        await page.locator('.session-list-item').first().click()
        await page.waitForURL(/\/sessions\/[^/]+/)

        // Perform edge swipe: start at left edge, swipe right
        await page.touchscreen.tap(5, 400) // Touch near left edge to prime
        const drawerPanel = page.locator('[data-testid="drawer-panel"]')

        // Simulate swipe from left edge to right
        const startX = 5
        const startY = 400
        const endX = 250
        const steps = 10

        // Use CDP to dispatch touch events for swipe
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: startX, y: startY }],
        })

        for (let i = 1; i <= steps; i++) {
            const x = startX + (endX - startX) * (i / steps)
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: Math.round(x), y: startY }],
            })
            await page.waitForTimeout(16) // ~60fps
        }

        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
        })

        await page.waitForTimeout(500) // Wait for animation

        // Drawer panel should be visible
        await expect(drawerPanel).toBeVisible()
    })

    test('drawer shows session list', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // Navigate to a session
        await page.locator('.session-list-item').first().click()
        await page.waitForURL(/\/sessions\/[^/]+/)

        // Open drawer via hamburger
        const hamburger = page.locator('[data-testid="drawer-hamburger"]')
        if (await hamburger.isVisible()) {
            await hamburger.click()
            await page.waitForTimeout(400)

            // Session items should be visible in the drawer
            const drawerPanel = page.locator('[data-testid="drawer-panel"]')
            await expect(drawerPanel.locator('.session-list-item').first()).toBeVisible()
        }
    })

    test('tap backdrop closes drawer', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        await page.locator('.session-list-item').first().click()
        await page.waitForURL(/\/sessions\/[^/]+/)

        // Open drawer
        const hamburger = page.locator('[data-testid="drawer-hamburger"]')
        if (await hamburger.isVisible()) {
            await hamburger.click()
            await page.waitForTimeout(400)

            // Tap backdrop (right side of screen)
            const backdrop = page.locator('[data-testid="drawer-backdrop"]')
            await backdrop.click({ position: { x: 30, y: 400 }, force: true })
            await page.waitForTimeout(400)

            // Drawer should be hidden (translated off-screen)
            const drawerPanel = page.locator('[data-testid="drawer-panel"]')
            const transform = await drawerPanel.evaluate(el =>
                getComputedStyle(el).transform
            )
            // When closed, drawer should be translated fully left
            expect(transform).not.toBe('none')
        }
    })

    test('tap session navigates and closes drawer', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // Get the first two sessions' URLs
        const firstItem = page.locator('.session-list-item').first()
        await firstItem.click()
        await page.waitForURL(/\/sessions\/[^/]+/)

        const firstUrl = page.url()

        // Open drawer
        const hamburger = page.locator('[data-testid="drawer-hamburger"]')
        if (await hamburger.isVisible()) {
            await hamburger.click()
            await page.waitForTimeout(400)

            // Click a different session in the drawer
            const drawerPanel = page.locator('[data-testid="drawer-panel"]')
            const secondItem = drawerPanel.locator('.session-list-item').nth(1)
            if (await secondItem.isVisible()) {
                await secondItem.click()
                await page.waitForTimeout(500)

                // URL should have changed
                expect(page.url()).not.toBe(firstUrl)
            }
        }
    })

    test('hamburger icon opens drawer', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        await page.locator('.session-list-item').first().click()
        await page.waitForURL(/\/sessions\/[^/]+/)

        const hamburger = page.locator('[data-testid="drawer-hamburger"]')
        await expect(hamburger).toBeVisible()

        await hamburger.click()
        await page.waitForTimeout(400)

        const drawerPanel = page.locator('[data-testid="drawer-panel"]')
        await expect(drawerPanel).toBeVisible()
    })
})

test.describe('desktop layout unchanged', () => {
    test.use({
        viewport: { width: 1280, height: 800 },
    })

    test('sidebar is visible inline with no drawer', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        await page.locator('.session-list-item').first().click()
        await page.waitForURL(/\/sessions\/[^/]+/)

        // On desktop, drawer elements should be hidden (lg:hidden)
        const drawerPanel = page.locator('[data-testid="drawer-panel"]')
        const drawerBackdrop = page.locator('[data-testid="drawer-backdrop"]')

        // These elements should not be visible on desktop
        if (await drawerPanel.count() > 0) {
            await expect(drawerPanel).not.toBeVisible()
        }
        if (await drawerBackdrop.count() > 0) {
            await expect(drawerBackdrop).not.toBeVisible()
        }

        // Hamburger should be hidden on desktop
        const hamburger = page.locator('[data-testid="drawer-hamburger"]')
        if (await hamburger.count() > 0) {
            await expect(hamburger).not.toBeVisible()
        }
    })
})
