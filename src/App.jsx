import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import MainLayout from './layouts/MainLayout'
import Home from './pages/Home'
import About from './pages/About'
import Services from './pages/Services'
import Contact from './pages/Contact'
import Profile from './pages/Profile'
import Resources from './pages/Resources'

// Code split: Lazy load landing pages for better performance
const LandingSampleReact = lazy(() => import('./pages/LandingSampleReact'))
const LandingSampleHtml = lazy(() => import('./pages/LandingSampleHtml'))
const LandingSampleFullStack = lazy(() => import('./pages/LandingSampleFullStack'))
const LandingSampleLocalService = lazy(() => import('./pages/LandingSampleLocalService'))
const LandingSampleEcommerce = lazy(() => import('./pages/LandingSampleEcommerce'))

import NotFound from './pages/errors/NotFound'
import Maintenance from './pages/errors/Maintenance'
import ErrorBoundary from './components/ErrorBoundary'

// Fallback component for lazy loaded pages
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-white animate-pulse">Loading...</div>
  </div>
)

const isMaintenance = import.meta.env.VITE_MAINTENANCE_MODE === 'true'

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <MainLayout />,
    children: [
      isMaintenance
        ? { index: true, element: <Maintenance /> }
        : { index: true, element: <Home /> },
      isMaintenance
        ? { path: 'about', element: <Maintenance /> }
        : { path: 'about', element: <About /> },
      isMaintenance
        ? { path: 'experiences', element: <Maintenance /> }
        : { path: 'experiences', element: <Navigate to="/profile" replace /> },
      isMaintenance
        ? { path: 'services', element: <Maintenance /> }
        : { path: 'services', element: <Services /> },
      isMaintenance
        ? { path: 'portfolio', element: <Maintenance /> }
        : { path: 'portfolio', element: <Navigate to="/profile" replace /> },
      isMaintenance
        ? { path: 'profile', element: <Maintenance /> }
        : { path: 'profile', element: <Profile /> },
      isMaintenance
        ? { path: 'resources', element: <Maintenance /> }
        : { path: 'resources', element: <Resources /> },
      { path: 'landing-sample-react', element: <Suspense fallback={<LoadingFallback />}><LandingSampleReact /></Suspense> },
      { path: 'landing-sample-html', element: <Suspense fallback={<LoadingFallback />}><LandingSampleHtml /></Suspense> },
      { path: 'landing-sample-fullstack', element: <Suspense fallback={<LoadingFallback />}><LandingSampleFullStack /></Suspense> },
      { path: 'landing-sample-local-service', element: <Suspense fallback={<LoadingFallback />}><LandingSampleLocalService /></Suspense> },
      { path: 'landing-sample-ecommerce', element: <Suspense fallback={<LoadingFallback />}><LandingSampleEcommerce /></Suspense> },
      { path: 'contact', element: <Contact /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}

export default App
