import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './lib/toast'
import Dashboard from './pages/Dashboard'
import Bottles from './pages/Bottles'
import Jobs from './pages/Jobs'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="/bottles" element={<Bottles />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/locations" element={<Navigate to="/jobs" replace />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  )
}
