import AnimatedIcon from './icons/AnimatedIcon'
import { MapPin, Mail } from './icons/icons'
import ResponsivePicture from './ResponsivePicture'

/**
 * Sidebar identity panel: photo, name, title, availability pill, and a
 * hairline-bordered contact meta block (location, email).
 *
 * @param {{
 *   aboutData: Record<string, unknown>,
 *   photo: import('../lib/images/optimizeImage').OptimizedPicture | null,
 * }} props
 */
function PersonalInfoCard({ aboutData, photo }) {
  return (
    <section data-reveal className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
      <div className="group relative">
        <div
          className="absolute -inset-2 rounded-full bg-gradient-to-br from-brand-teal/40 to-brand-orange/40 blur-md"
          style={{ animation: 'pulse-soft 3.5s ease-in-out infinite' }}
          aria-hidden="true"
        />
        <ResponsivePicture
          image={photo}
          alt="Profile photo of Stephen Rey G. Agustinez"
          className="relative h-28 w-28 rounded-full border-2 border-brand-orange/25 object-cover shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:border-brand-orange/45 sm:h-32 sm:w-32"
        />
        <div className="absolute inset-0 rounded-full bg-brand-teal/0 transition-all duration-300 group-hover:bg-brand-teal/10 group-hover:blur-xl" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-brand-ink sm:text-[1.75rem]">{aboutData.name}</h2>
        {aboutData.role ? <p className="text-sm text-brand-teal">{aboutData.role}</p> : null}
        <span className="badge-pill inline-block">Available for part-time and full-time engagements</span>
      </div>

      <div className="w-full space-y-3 border-t border-slate-200 pt-5">
        <div className="flex items-start justify-center gap-3 lg:justify-start">
          <div className="mt-0.5">
            <AnimatedIcon icon={MapPin} size={16} color="text-brand-teal" animationType="none" ariaLabel="Location" />
          </div>
          <p className="text-sm text-slate-700">{aboutData.location}</p>
        </div>

        <div className="flex items-start justify-center gap-3 lg:justify-start">
          <div className="mt-0.5">
            <AnimatedIcon
              icon={Mail}
              size={16}
              color="text-brand-teal group-hover:text-brand-orange"
              animationType="hover-scale"
              ariaLabel="Email"
            />
          </div>
          <a
            href={`mailto:${aboutData.email}`}
            className="break-all text-sm text-brand-teal transition hover:text-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
          >
            {aboutData.email}
          </a>
        </div>
      </div>

      <nav
        data-profile-side-nav
        aria-label="Profile sections"
        className="profile-side-nav relative hidden w-full lg:block"
      >
        <div className="profile-side-nav-glow" aria-hidden="true" />
        <a href="#about" className="profile-side-nav-link is-active text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-inset">About</a>
        <a href="#education" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-inset">Education</a>
        <a href="#certifications" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-inset">Certifications</a>
        <a href="#experience" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-inset">Experience</a>
        <a href="#tools" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-inset">Tools &amp; Platforms</a>
        <a href="#portfolio" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-inset">Portfolio</a>
      </nav>
    </section>
  )
}

export default PersonalInfoCard
