import { Outlet, ScrollRestoration } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

function MainLayout() {
  return (
    <div className="relative flex min-h-screen flex-col text-slate-900">
      <Navbar />

      <div className="relative z-10 flex flex-1 flex-col pt-28">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-6">
          <Outlet />
        </main>
        <Footer />
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-20 h-64 w-64 rounded-full bg-brand-teal/10 blur-[140px]" />
        <div className="absolute right-1/4 top-48 h-80 w-80 rounded-full bg-brand-orange/10 blur-[160px]" />
        <div className="absolute bottom-20 left-10 h-48 w-48 rounded-full bg-fuchsia-200/25 blur-[130px]" />
      </div>

      <ScrollRestoration />
    </div>
  )
}

export default MainLayout
