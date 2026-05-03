import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './lib/toast'
import { ThemeApplier } from './lib/theme'
import Dashboard from './pages/Dashboard'
import Bottles from './pages/Bottles'
import Sites from './pages/Sites'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'

export default function App() {
  // ToastProvider sits ABOVE StoreProvider so the store can surface
  // save/quota/corruption errors via useToast().
  return (
    <ToastProvider>
      <StoreProvider>
        <ThemeApplier />
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="/bottles" element={<Bottles />} />
              <Route path="/sites" element={<Sites />} />
              <Route path="/jobs" element={<Navigate to="/sites" replace />} />
              <Route path="/locations" element={<Navigate to="/sites" replace />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </StoreProvider>
    </ToastProvider>
  )
}
