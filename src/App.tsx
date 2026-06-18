import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { OnboardingGate } from './components/Onboarding'
import { AccountClosedGate } from './components/AccountClosed'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './lib/toast'
import { ConfirmProvider } from './lib/confirm'
import { ThemeApplier } from './lib/theme'
import Dashboard from './pages/Dashboard'
import Bottles from './pages/Bottles'
import Sites from './pages/Sites'
import Transactions from './pages/Transactions'
import AuditLog from './pages/AuditLog'
import Settings from './pages/Settings'
import AccountDeletion from './pages/AccountDeletion'
import TermsPage, { TermsGate } from './components/Terms'
import PrivacyPage from './components/Privacy'
import AcceptableUsePage from './components/AcceptableUse'
import BillingRefundPage from './components/BillingRefund'

export default function App() {
  // ToastProvider sits ABOVE StoreProvider so the store can surface
  // save/quota/corruption errors via useToast(). ConfirmProvider sits
  // alongside Toast for the same reason (themed confirm dialogs).
  return (
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <ThemeApplier />
          <AccountClosedGate>
            <OnboardingGate>
            <TermsGate>
            <HashRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="/bottles" element={<Bottles />} />
                  <Route path="/sites" element={<Sites />} />
                  <Route path="/jobs" element={<Navigate to="/sites" replace />} />
                  <Route path="/locations" element={<Navigate to="/sites" replace />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/history" element={<AuditLog />} />
                  <Route path="/settings" element={<Settings />} />
                <Route path="/account-deletion" element={<AccountDeletion />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/acceptable-use" element={<AcceptableUsePage />} />
                <Route path="/billing" element={<BillingRefundPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </HashRouter>
            </TermsGate>
            </OnboardingGate>
          </AccountClosedGate>
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
