import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import MainLayout from './layouts/MainLayout'

const Home = lazy(() => import('./legacy-app/pages/Home'))
const About = lazy(() => import('./legacy-app/pages/About'))
const Services = lazy(() => import('./legacy-app/pages/Services'))
const Contact = lazy(() => import('./legacy-app/pages/Contact'))
const Profile = lazy(() => import('./legacy-app/pages/Profile'))
const Resources = lazy(() => import('./legacy-app/pages/Resources'))
const LandingSampleReact = lazy(() => import('./legacy-app/pages/LandingSampleReact'))
const LandingSampleHtml = lazy(() => import('./legacy-app/pages/LandingSampleHtml'))
const LandingSampleFullStack = lazy(() => import('./legacy-app/pages/LandingSampleFullStack'))
const LandingSampleLocalService = lazy(() => import('./legacy-app/pages/LandingSampleLocalService'))
const LandingSampleEcommerce = lazy(() => import('./legacy-app/pages/LandingSampleEcommerce'))
const Admin = lazy(() => import('./legacy-app/pages/Admin'))
const NotFound = lazy(() => import('./legacy-app/pages/errors/NotFound'))
const Maintenance = lazy(() => import('./legacy-app/pages/errors/Maintenance'))

import ErrorBoundary from './components/ErrorBoundary'

const LoadingFallback = () => (
  <div className="flex min-h-[55vh] items-center justify-center">
    <div className="rounded-full bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-teal">Loading...</div>
  </div>
)

const lazyPage = (Component) => (
  <Suspense fallback={<LoadingFallback />}>
    <Component />
  </Suspense>
)

const isMaintenance = import.meta.env.VITE_MAINTENANCE_MODE === 'true'

const router = createBrowserRouter([
  {
    path: '/admin',
    element: lazyPage(Admin),
  },
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <MainLayout />,
    children: [
      isMaintenance
        ? { index: true, element: lazyPage(Maintenance) }
        : { index: true, element: lazyPage(Home) },
      isMaintenance
        ? { path: 'about', element: lazyPage(Maintenance) }
        : { path: 'about', element: lazyPage(About) },
      isMaintenance
        ? { path: 'experiences', element: lazyPage(Maintenance) }
        : { path: 'experiences', element: <Navigate to="/profile" replace /> },
      isMaintenance
        ? { path: 'services', element: lazyPage(Maintenance) }
        : { path: 'services', element: lazyPage(Services) },
      isMaintenance
        ? { path: 'portfolio', element: lazyPage(Maintenance) }
        : { path: 'portfolio', element: <Navigate to="/profile" replace /> },
      isMaintenance
        ? { path: 'profile', element: lazyPage(Maintenance) }
        : { path: 'profile', element: lazyPage(Profile) },
      isMaintenance
        ? { path: 'resources', element: lazyPage(Maintenance) }
        : { path: 'resources', element: lazyPage(Resources) },
      isMaintenance
        ? { path: 'resources/:slug', element: lazyPage(Maintenance) }
        : { path: 'resources/:slug', element: lazyPage(Resources) },
      { path: 'landing-sample-react', element: lazyPage(LandingSampleReact) },
      { path: 'landing-sample-html', element: lazyPage(LandingSampleHtml) },
      { path: 'landing-sample-fullstack', element: lazyPage(LandingSampleFullStack) },
      { path: 'landing-sample-local-service', element: lazyPage(LandingSampleLocalService) },
      { path: 'landing-sample-ecommerce', element: lazyPage(LandingSampleEcommerce) },
      { path: 'contact', element: lazyPage(Contact) },
      { path: '*', element: lazyPage(NotFound) },
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
