import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nContext, I18nProvider } from '@/lib/i18n-context'
import { AppContextProvider } from '@/lib/app-context'
import { en } from '@/lib/locales'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import SettingsPage from './index'

// Mock the router hooks
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
    useRouter: () => ({ history: { back: vi.fn() } }),
    useLocation: () => '/settings',
}))

// Mock useFontScale hook
vi.mock('@/hooks/useFontScale', () => ({
    useFontScale: () => ({ fontScale: 1, setFontScale: vi.fn() }),
    getFontScaleOptions: () => [
        { value: 0.875, label: '87.5%' },
        { value: 1, label: '100%' },
        { value: 1.125, label: '112.5%' },
    ],
}))

// Mock languages
vi.mock('@/lib/languages', () => ({
    getElevenLabsSupportedLanguages: () => [
        { code: null, name: 'Auto-detect' },
        { code: 'en', name: 'English' },
    ],
    getLanguageDisplayName: (lang: { code: string | null; name: string }) => lang.name,
}))

const defaultPreferences = {
    readyAnnouncements: true,
    permissionNotifications: true,
    errorNotifications: false
}

function makeApi(overrides?: {
    getPreferencesResult?: typeof defaultPreferences
    updatePreferencesShouldFail?: boolean
}) {
    return {
        getPreferences: vi.fn(async () => overrides?.getPreferencesResult ?? defaultPreferences),
        updatePreferences: vi.fn(async (payload: Record<string, unknown>) => {
            if (overrides?.updatePreferencesShouldFail) {
                throw new Error('Server error')
            }
            return {
                ok: true,
                preferences: { ...defaultPreferences, ...payload }
            }
        })
    }
}

function renderWithProviders(ui: React.ReactElement, api = makeApi()) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } }
    })
    return {
        api,
        ...render(
            <QueryClientProvider client={queryClient}>
                <AppContextProvider value={{ api: api as any, token: 'token', baseUrl: '' }}>
                    <I18nProvider>
                        {ui}
                    </I18nProvider>
                </AppContextProvider>
            </QueryClientProvider>
        )
    }
}

function renderWithSpyT(ui: React.ReactElement) {
    const translations = en as Record<string, string>
    const spyT = vi.fn((key: string) => translations[key] ?? key)
    const api = makeApi()
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } }
    })
    render(
        <QueryClientProvider client={queryClient}>
            <AppContextProvider value={{ api: api as any, token: 'token', baseUrl: '' }}>
                <I18nContext.Provider value={{ t: spyT, locale: 'en', setLocale: vi.fn() }}>
                    {ui}
                </I18nContext.Provider>
            </AppContextProvider>
        </QueryClientProvider>
    )
    return spyT
}

describe('SettingsPage', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    beforeEach(() => {
        // Mock localStorage
        const localStorageMock = {
            getItem: vi.fn(() => 'en'),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        }
        Object.defineProperty(window, 'localStorage', { value: localStorageMock })
    })

    it('renders the About section', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getByText('About')).toBeInTheDocument()
    })

    it('displays the App Version with correct value', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('App Version').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(__APP_VERSION__).length).toBeGreaterThanOrEqual(1)
    })

    it('displays the Protocol Version with correct value', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('Protocol Version').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(String(PROTOCOL_VERSION)).length).toBeGreaterThanOrEqual(1)
    })

    it('displays the website link with correct URL and security attributes', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('Website').length).toBeGreaterThanOrEqual(1)
        const links = screen.getAllByRole('link', { name: 'hapi.run' })
        expect(links.length).toBeGreaterThanOrEqual(1)
        const link = links[0]
        expect(link).toHaveAttribute('href', 'https://hapi.run')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('uses correct i18n keys for About section', () => {
        const spyT = renderWithSpyT(<SettingsPage />)
        const calledKeys = spyT.mock.calls.map((call) => call[0])
        expect(calledKeys).toContain('settings.about.title')
        expect(calledKeys).toContain('settings.about.website')
        expect(calledKeys).toContain('settings.about.appVersion')
        expect(calledKeys).toContain('settings.about.protocolVersion')
    })

    it('renders the Notifications section with 3 toggles', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getByText('Notifications')).toBeInTheDocument()
        expect(screen.getByText('Ready / Idle')).toBeInTheDocument()
        expect(screen.getByText('Permission Prompts')).toBeInTheDocument()
        expect(screen.getByText('Error Notifications')).toBeInTheDocument()
    })

    it('Error Notifications toggle is disabled with Coming soon sublabel', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getByText('Coming soon')).toBeInTheDocument()
        const errorToggle = screen.getByRole('switch', { name: /error notifications/i })
        expect(errorToggle).toBeDisabled()
    })

    it('shows allDisabledWarning when both enabled toggles are off', async () => {
        const api = makeApi({
            getPreferencesResult: {
                readyAnnouncements: false,
                permissionNotifications: false,
                errorNotifications: false
            }
        })
        renderWithProviders(<SettingsPage />, api)
        await waitFor(() => {
            expect(screen.getByText('All notifications are off. You may miss important events.')).toBeInTheDocument()
        })
    })

    it('does not show allDisabledWarning when at least one enabled toggle is on', async () => {
        const api = makeApi({
            getPreferencesResult: {
                readyAnnouncements: true,
                permissionNotifications: false,
                errorNotifications: false
            }
        })
        renderWithProviders(<SettingsPage />, api)
        await waitFor(() => {
            expect(screen.queryByText('All notifications are off. You may miss important events.')).not.toBeInTheDocument()
        })
    })

    it('calls updatePreferences with readyAnnouncements=false when Ready/Idle toggled off', async () => {
        const api = makeApi()
        renderWithProviders(<SettingsPage />, api)
        await waitFor(() => {
            expect(api.getPreferences).toHaveBeenCalled()
        })

        const toggle = screen.getByRole('switch', { name: /ready \/ idle/i })
        fireEvent.click(toggle)
        expect(api.updatePreferences).toHaveBeenCalledWith({ readyAnnouncements: false })
    })

    it('calls updatePreferences with permissionNotifications=false when Permission Prompts toggled off', async () => {
        const api = makeApi()
        renderWithProviders(<SettingsPage />, api)
        await waitFor(() => {
            expect(api.getPreferences).toHaveBeenCalled()
        })

        const toggle = screen.getByRole('switch', { name: /permission prompts/i })
        fireEvent.click(toggle)
        expect(api.updatePreferences).toHaveBeenCalledWith({ permissionNotifications: false })
    })

    it('rolls back Ready/Idle toggle on server failure', async () => {
        const api = makeApi({ updatePreferencesShouldFail: true })
        renderWithProviders(<SettingsPage />, api)
        await waitFor(() => {
            expect(api.getPreferences).toHaveBeenCalled()
        })

        const toggle = screen.getByRole('switch', { name: /ready \/ idle/i })
        // Initially on (server returned true)
        expect(toggle).toHaveAttribute('aria-checked', 'true')

        fireEvent.click(toggle)
        // After optimistic update: should be false briefly, then rollback to true
        await waitFor(() => {
            expect(toggle).toHaveAttribute('aria-checked', 'true')
        })
    })
})
