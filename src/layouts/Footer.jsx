import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-600 sm:px-6 lg:px-6">
        <div className="flex flex-col gap-8 text-center md:flex-row md:items-start md:justify-between md:text-left">
          <div className="mb-4 flex flex-1 flex-col items-center md:mb-0 md:items-start">
            <p className="mb-1 text-lg font-semibold text-brand-ink">DevLab Studios</p>
            <p className="mb-3 whitespace-normal text-slate-500 md:whitespace-nowrap">
              Your Vision, Digitally Crafted - one solution at a time, always evolving.
            </p>
            <a href="mailto:stpnrey.agustinez@gmail.com" className="mb-1 block text-slate-700 hover:text-brand-teal hover:underline">stpnrey.agustinez@gmail.com</a>
            <span className="block text-slate-500">Lapu-Lapu City, Cebu, PH</span>
          </div>

          <div className="mb-4 flex flex-1 flex-col items-center md:mb-0">
            <p className="mb-2 font-semibold text-brand-ink">Quick Links</p>
            <ul className="space-y-1">
              <li><Link to="/" className="hover:text-brand-teal hover:underline">Home</Link></li>
              <li><Link to="/about" className="hover:text-brand-teal hover:underline">About</Link></li>
              <li><Link to="/services" className="hover:text-brand-teal hover:underline">Services</Link></li>
              <li><Link to="/resources" className="hover:text-brand-teal hover:underline">Resources</Link></li>
              <li><Link to="/profile" className="hover:text-brand-teal hover:underline">Profile</Link></li>
              <li><Link to="/contact" className="hover:text-brand-teal hover:underline">Contact</Link></li>
            </ul>
          </div>

          <div className="flex flex-1 flex-col items-center md:items-end">
            <p className="mb-2 font-semibold text-brand-ink">Connect</p>
            <div className="flex gap-4">
              <a href="https://www.linkedin.com/in/stephen-rey-agustinez-8b86041b3" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="hover:text-brand-teal">LinkedIn</a>
              <a href="https://github.com/stpn-dev" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="hover:text-brand-ink">GitHub</a>
              <a href="mailto:stpnrey.agustinez@gmail.com" aria-label="Email" className="hover:text-brand-orange">Email</a>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-4 text-center text-xs text-slate-500 md:flex-row md:items-center md:justify-between md:text-left">
          <span>&copy; 2026 DevLab Studios. All rights reserved.</span>
          <span>Privacy Policy | Terms of Service</span>
        </div>
      </div>
    </footer>
  )
}

export default Footer
