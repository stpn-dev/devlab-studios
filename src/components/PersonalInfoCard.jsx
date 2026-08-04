import AnimatedIcon from './icons/AnimatedIcon'
import { MapPin, Mail } from './icons/icons'
import ResponsivePicture from './ResponsivePicture'

/**
 * @param {{
 *   aboutData: Record<string, unknown>,
 *   photo: import('../lib/images/optimizeImage').OptimizedPicture | null,
 * }} props
 */
function PersonalInfoCard({ aboutData, photo }) {
  return (
    <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-8 text-center lg:flex-row lg:text-left">
        <div className="flex justify-center lg:justify-center lg:self-center">
          <div className="group relative">
            <ResponsivePicture
              image={photo}
              alt="Profile photo of Stephen Rey G. Agustinez"
              className="h-28 w-28 rounded-full border-2 border-brand-orange/25 object-cover shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:border-brand-orange/45 sm:h-36 sm:w-36 lg:h-40 lg:w-40"
            />
            <div className="absolute inset-0 rounded-full bg-brand-teal/0 transition-all duration-300 group-hover:bg-brand-teal/10 group-hover:blur-xl" />
          </div>
        </div>

        <div className="flex h-full items-center justify-center lg:justify-center lg:self-center">
          <div className="space-y-4 lg:max-w-2xl">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-600">Name</p>
              <h2 className="text-2xl font-semibold text-brand-ink sm:text-3xl">{aboutData.name}</h2>
              {aboutData.role ? <p className="text-sm text-brand-teal">{aboutData.role}</p> : null}
            </div>

            <div className="space-y-4">
              <div className="flex items-start justify-center gap-3 lg:justify-start">
                <div className="mt-1">
                  <AnimatedIcon
                    icon={MapPin}
                    size={18}
                    color="text-brand-teal"
                    animationType="none"
                    ariaLabel="Location"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-600">Location</p>
                  <p className="mt-1 text-lg text-slate-700">{aboutData.location}</p>
                </div>
              </div>

              <div className="flex items-start justify-center gap-3 lg:justify-start">
                <div className="mt-1">
                  <AnimatedIcon
                    icon={Mail}
                    size={18}
                    color="text-brand-teal group-hover:text-brand-orange"
                    animationType="hover-scale"
                    ariaLabel="Email"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-600">Email</p>
                  <a
                    href={`mailto:${aboutData.email}`}
                    className="mt-1 text-lg break-all text-brand-teal transition hover:text-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
                  >
                    {aboutData.email}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PersonalInfoCard
