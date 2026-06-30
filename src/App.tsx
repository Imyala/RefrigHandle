import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ScrollRestoration } from './components/ScrollRestoration'
import { LocationTimezoneSync } from './components/LocationTimezoneSync'
import { OnboardingGate } from './components/Onboarding'
import { AccountClosedGate } from './components/AccountClosed'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './lib/toast'
import { ConfirmProvider } from './lib/confirm'
import { ThemeApplier } from './lib/theme'
import { TermsGate } from './components/Terms'

// Route components are lazy-loaded so the first paint ships only the shell
// and the landing route's code, not every page, the PDF/quarterly report,
// the label/QR printer and all eight policy pages. Each becomes its own
// chunk, fetched on navigation. The TermsGate (and its content) is needed
// up front, so only the standalone /terms *page* is split, not the gate.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Bottles = lazy(() => import('./pages/Bottles'))
const Sites = lazy(() => import('./pages/Sites'))
const Jobs = lazy(() => import('./pages/Jobs'))
const Transactions = lazy(() => import('./pages/Transactions'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Settings = lazy(() => import('./pages/Settings'))
const AccountDeletion = lazy(() => import('./pages/AccountDeletion'))
const TermsPage = lazy(() => import('./components/Terms'))
const PrivacyPage = lazy(() => import('./components/Privacy'))
const AcceptableUsePage = lazy(() => import('./components/AcceptableUse'))
const BillingRefundPage = lazy(() => import('./components/BillingRefund'))
const DataRetentionPage = lazy(() => import('./components/DataRetention'))
const SecurityPage = lazy(() => import('./components/Security'))
const DisclaimerPage = lazy(() => import('./components/Disclaimer'))
const CopyrightPage = lazy(() => import('./components/Copyright'))

export default function App() {
  // ToastProvider sits ABOVE StoreProvider so the store can surface
  // save/quota/corruption errors via useToast(). ConfirmProvider sits
  // alongside Toast for the same reason (themed confirm dialogs).
  return (
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <ThemeApplier />
          <LocationTimezoneSync />
          <AccountClosedGate>
            <OnboardingGate>
            <TermsGate>
            <HashRouter>
              <ScrollRestoration />
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="/bottles" element={<Bottles />} />
                  <Route path="/sites" element={<Sites />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/locations" element={<Navigate to="/sites" replace />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/history" element={<AuditLog />} />
                  <Route path="/settings" element={<Settings />} />
                <Route path="/account-deletion" element={<AccountDeletion />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/acceptable-use" element={<AcceptableUsePage />} />
                <Route path="/billing" element={<BillingRefundPage />} />
                <Route path="/data-retention" element={<DataRetentionPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/disclaimer" element={<DisclaimerPage />} />
                <Route path="/copyright" element={<CopyrightPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
              </Suspense>
            </HashRouter>
            </TermsGate>
            </OnboardingGate>
          </AccountClosedGate>
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}

// Shown for the brief moment a lazily-loaded route chunk is fetching. Kept
// deliberately minimal — a centred spinner inside the Layout's main column —
// so a fast navigation doesn't flash heavy skeleton UI.
function RouteFallback() {
  return (
    <div className="flex min-h-[50svh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 dark:border-slate-700 dark:border-t-brand-400" />
    </div>
  )
}
