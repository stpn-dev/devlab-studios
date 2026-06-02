import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import PrimaryButton from '../components/PrimaryButton'
import AnimatedIcon from '../components/icons/AnimatedIcon'
import { Mail, Menu, X } from '../components/icons/icons'
import devlabStudiosLogo from '../assets/devlabstudios-logo-only.png'
import devlabStudiosLogoWebp from '../assets/devlabstudios-logo-only.webp'



const navLinks = [
  { label: 'About', to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'Resources', to: '/resources' },
  { label: 'Profile', to: '/profile' },
]

function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  const linkBase =
    'px-3 py-2 text-sm font-semibold text-slate-600 transition hover:text-brand-ink focus-visible:outline-none'

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="w-full px-4 mx-auto max-w-7xl sm:px-6 lg:px-6">
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-[0_12px_34px_rgba(12,26,51,0.08)] backdrop-blur-md">
          <Link to="/" className="flex items-center gap-3 text-lg font-bold tracking-tight text-brand-teal">
              <picture>
                <source srcSet={devlabStudiosLogoWebp} type="image/webp" />
                <img
                  src={devlabStudiosLogo}
                  alt="DevLab Studios"
                  className="h-11 w-11 rounded-md object-contain"
                  loading="lazy"
                  width="44"
                  height="44"
                />
              </picture>
            <span className="hidden sm:inline">DevLab Studios</span>
          </Link>

          <nav className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-2 py-1 md:flex">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    linkBase,
                    isActive
                      ? 'text-brand-ink underline decoration-2 decoration-brand-orange underline-offset-8'
                      : 'text-slate-600',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:block">
            <div className="group">
              <PrimaryButton to="/contact" className="flex items-center gap-2 px-4 py-2">
                <AnimatedIcon icon={Mail} size={18} animationType="hover-scale" />
                Contact Me
              </PrimaryButton>
            </div>
          </div>

          <button
            type="button"
            className="group inline-flex items-center justify-center rounded-lg border border-slate-300 p-2 text-brand-ink transition hover:bg-slate-100 md:hidden"
            aria-label="Toggle navigation"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <span className="sr-only">Toggle menu</span>
            {isOpen ? (
              <AnimatedIcon icon={X} size={24} animationType="none" />
            ) : (
              <AnimatedIcon icon={Menu} size={24} animationType="none" />
            )}
          </button>
        </div>

        {isOpen ? (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_25px_rgba(12,26,51,0.08)] md:hidden">
            <nav className="flex flex-col gap-1">
              {navLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'block rounded-xl px-3 py-2 text-sm font-semibold transition',
                      isActive ? 'bg-brand-mint text-brand-ink' : 'text-slate-600 hover:bg-slate-100',
                    ].join(' ')
                  }
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              <PrimaryButton to="/contact" className="flex items-center justify-center w-full gap-2">
                <AnimatedIcon icon={Mail} size={16} animationType="none" />
                Contact Me
              </PrimaryButton>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  )
}

export default Navbar
