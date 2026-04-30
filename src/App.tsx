import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { StoreProvider } from './lib/store'
import Dashboard from './pages/Dashboard'
import Bottles from './pages/Bottles'
import Locations from './pages/Locations'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/bottles" element={<Bottles />} />
            <Route path="/locations" element={<Locations />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
