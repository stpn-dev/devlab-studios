import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PlayersPage from './pages/PlayersPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import VenuesPage from './pages/VenuesPage'
import SessionsListPage from './pages/SessionsListPage'
import OperatorsPage from './pages/OperatorsPage'
import AuditPage from './pages/AuditPage'
import SessionLayout from './components/SessionLayout'
import SessionControlPage from './pages/SessionControlPage'
import CheckInPage from './pages/CheckInPage'
import QueuePage from './pages/QueuePage'
import CourtsPage from './pages/CourtsPage'
import GamesListPage from './pages/GamesListPage'
import ScorekeeperPage from './pages/ScorekeeperPage'
import LeaderboardPage from './pages/LeaderboardPage'

function buildRouter(session, organizations, onSwitchOrg, onLogout) {
  return createBrowserRouter([
    {
      path: '/pickleball/app',
      element: <AppShell session={session} organizations={organizations} onSwitchOrg={onSwitchOrg} onLogout={onLogout} />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'players', element: <PlayersPage /> },
        { path: 'players/:playerId', element: <PlayerProfilePage /> },
        { path: 'venues', element: <VenuesPage /> },
        { path: 'sessions', element: <SessionsListPage /> },
        { path: 'operators', element: <OperatorsPage /> },
        { path: 'audit', element: <AuditPage /> },
        {
          path: 'sessions/:sessionId',
          element: <SessionLayout />,
          children: [
            { index: true, element: <SessionControlPage /> },
            { path: 'check-in', element: <CheckInPage /> },
            { path: 'queue', element: <QueuePage /> },
            { path: 'courts', element: <CourtsPage /> },
            { path: 'games', element: <GamesListPage /> },
            { path: 'games/:gameId', element: <ScorekeeperPage /> },
            { path: 'leaderboard', element: <LeaderboardPage /> },
          ],
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
