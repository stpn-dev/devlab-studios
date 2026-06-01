function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-600 sm:px-6 lg:px-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-8 text-center md:text-left">
          {/* Contact & Address */}
          <div className="flex-1 mb-4 md:mb-0 flex flex-col items-center md:items-start">
            <p className="mb-1 text-lg font-semibold text-brand-ink">DevLab Studios</p>
            {/* Responsive tagline: single line on large screens, wraps on small */}
            <p className="mb-3 whitespace-normal text-slate-500 md:whitespace-nowrap">
              Your Vision, Digitally Crafted—one solution at a time, always evolving.
            </p>
            <a href="mailto:stpnrey.agustinez@gmail.com" className="mb-1 block text-slate-700 hover:text-brand-teal hover:underline">stpnrey.agustinez@gmail.com</a>
            <span className="block text-slate-500">Lapu-lapu City, Cebu, PH</span>
          </div>
          {/* Quick Links */}
          <div className="flex-1 mb-4 md:mb-0 flex flex-col items-center">
            <p className="mb-2 font-semibold text-brand-ink">Quick Links</p>
            <ul className="space-y-1">
              <li><a href="/" className="hover:text-brand-teal hover:underline">Home</a></li>
              <li><a href="/about" className="hover:text-brand-teal hover:underline">About</a></li>
              <li><a href="/portfolio" className="hover:text-brand-teal hover:underline">Portfolio</a></li>
              <li><a href="/contact" className="hover:text-brand-teal hover:underline">Contact</a></li>
            </ul>
          </div>
          {/* Social Media */}
          <div className="flex-1 flex flex-col items-center md:items-end">
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
          <span className="mt-2 md:mt-0">Privacy Policy | Terms of Service</span>
        </div>
      </div>
    </footer>
  )
}

export default Footer
