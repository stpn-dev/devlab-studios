import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AdminShell from './components/AdminShell'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ContentTypePage from './pages/ContentTypePage'
import CollectionTypePage from './pages/CollectionTypePage'
import PageBuilderPage from './pages/PageBuilderPage'
import MediaLibraryPage from './pages/MediaLibraryPage'
import AuditLogPage from './pages/AuditLogPage'
import LeadsPage from './pages/LeadsPage'

function buildRouter(session, onLogout) {
  return createBrowserRouter([
    {
      path: '/admin',
      element: <AdminShell session={session} onLogout={onLogout} />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'content/:type', element: <ContentTypePage /> },
        { path: 'collections/:type', element: <CollectionTypePage /> },
        { path: 'pages/:slug', element: <PageBuilderPage /> },
        { path: 'media', element: <MediaLibraryPage /> },
        { path: 'audit-log', element: <AuditLogPage /> },
        { path: 'leads', element: <LeadsPage /> },
      ],
    },
  ])
}

function AdminApp() {
  const [session, setSession] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function checkSession() {
      try {
        const response = await fetch('/api/admin/session', { credentials: 'include' })
        if (!isMounted) return
        setSession(response.ok ? await response.json() : null)
      } catch {
        if (isMounted) setSession(null)
      } finally {
        if (isMounted) setIsCheckingSession(false)
      }
    }

    checkSession()
    return () => {
      isMounted = false
    }
  }, [])

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setSession(null)
  }

  if (isCheckingSession) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-semibold text-slate-500">Loading admin session…</div>
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />
  }

  return <RouterProvider router={buildRouter(session, handleLogout)} />
}

export default AdminApp
