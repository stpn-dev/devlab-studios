import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import MainLayout from './layouts/MainLayout'

const Home = lazy(() => import('./legacy-app/pages/Home'))
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
      { index: true, element: lazyPage(Home) },
      { path: 'experiences', element: <Navigate to="/profile" replace /> },
      { path: 'services', element: lazyPage(Services) },
      { path: 'portfolio', element: <Navigate to="/profile" replace /> },
      { path: 'profile', element: lazyPage(Profile) },
      { path: 'resources', element: lazyPage(Resources) },
      { path: 'resources/:slug', element: lazyPage(Resources) },
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
