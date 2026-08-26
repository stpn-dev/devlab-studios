import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PlayersPage from './pages/PlayersPage'
import VenuesPage from './pages/VenuesPage'
import SessionsListPage from './pages/SessionsListPage'
import SessionLayout from './components/SessionLayout'
import SessionControlPage from './pages/SessionControlPage'

function buildRouter(session, organizations, onSwitchOrg, onLogout) {
  return createBrowserRouter([
    {
      path: '/pickleball/app',
      element: <AppShell session={session} organizations={organizations} onSwitchOrg={onSwitchOrg} onLogout={onLogout} />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'players', element: <PlayersPage /> },
        { path: 'venues', element: <VenuesPage /> },
        { path: 'sessions', element: <SessionsListPage /> },
        {
          path: 'sessions/:sessionId',
          element: <SessionLayout />,
          children: [{ index: true, element: <SessionControlPage /> }],
        },
      ],
    },
  ])
}

export default function PickleballApp() {
  const [session, setSession] = useState(null)
  const [organizations, setOrganizations] = useState([])
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  async function loadSession() {
    try {
      const response = await fetch('/api/pickleball/auth/session', { credentials: 'include' })
      if (!response.ok) {
        setSession(null)
        setOrganizations([])
        return
      }
      const body = await response.json()
      setSession(body)
      setOrganizations(body.organizations || [])
    } catch {
      setSession(null)
      setOrganizations([])
    } finally {
      setIsCheckingSession(false)
    }
  }

  useEffect(() => {
    loadSession()
  }, [])

  async function handleSwitchOrg(organizationId) {
    await fetch('/api/pickleball/auth/switch-org', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId }),
    })
    await loadSession()
  }

  async function handleLogout() {
    await fetch('/api/pickleball/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setSession(null)
  }

  if (isCheckingSession) {
    return <div className="flex min-h-screen items-center justify-center text-sm font-semibold text-slate-500">Loading…</div>
  }

  if (!session) {
    return <LoginPage />
  }

  return <RouterProvider router={buildRouter(session, organizations, handleSwitchOrg, handleLogout)} />
}
