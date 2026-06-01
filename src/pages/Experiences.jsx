import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import SectionHeader from '../components/SectionHeader'
import AnimatedIcon from '../components/icons/AnimatedIcon'
import ImageModal from '../components/ImageModal'
import { experiences } from '../data/experiences'
import { Briefcase, Calendar, ArrowRight, Maximize2 } from '../components/icons/icons'

function Experiences() {
  const [selectedImage, setSelectedImage] = useState(null)

  return (
    <>
      <Helmet>
        <title>Work Experience – Software Engineer &amp; AI Automation Specialist | Devlab Studios</title>
        <meta name="description" content="Professional experience of Devlab Studios across software engineering, AI automation, and operations. Roles include AI Automation Specialist, Custom Software Engineer Associate at Accenture, and engineering roles at ONSEMI." />
        <meta name="keywords" content="software engineer experience, AI automation specialist experience, Spring Boot engineer, backend developer experience, React developer experience, automation work history, Accenture Java developer" />
        <meta property="og:title" content="Work Experience – Software Engineer &amp; AI Automation Specialist | Devlab Studios" />
        <meta property="og:description" content="Devlab Studios professional experience across software engineering, automation systems, and operations improvement." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.devlabstudios.com/experiences" />
        <meta property="og:image" content="/screenshots/portfolio-experiences.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Work Experience – Software Engineer &amp; AI Automation Specialist" />
        <meta name="twitter:description" content="Work history across software engineering, automation systems, and operations roles — Accenture, ONSEMI, and self-employed projects." />
        <meta name="twitter:image" content="/screenshots/portfolio-experiences.png" />
      </Helmet>
    <div className="space-y-8">
      <SectionHeader
        title="Experiences"
        subtitle="Roles, responsibilities, and achievements across professional operations and technical VA work."
      />

      <div className="space-y-6">
        {experiences.map((item) => (
          <section key={item.id} className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-8">
            {/* Image Section (if image exists) */}
            {item.image && (
              <div
                className="group relative mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white/90 cursor-pointer transition-all hover:border-brand-orange/35"
                onClick={() => setSelectedImage(item.image)}
              >
                <img
                  src={item.image}
                  alt={`${item.role} project screenshot`}
                  className="h-64 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Hover Overlay with Icon */}
                <div className="absolute inset-0 flex items-center justify-center bg-brand-ink/0 transition-colors duration-300 group-hover:bg-brand-ink/35">
                  <AnimatedIcon
                    icon={Maximize2}
                    size={32}
                    color="text-white opacity-0 group-hover:opacity-100"
                    animationType="none"
                    ariaLabel="Enlarge image"
                    className="transition-opacity duration-300"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <AnimatedIcon
                    icon={Briefcase}
                    size={16}
                    color="text-brand-teal"
                    animationType="none"
                    ariaLabel="Role type"
                  />
                  <p className="text-sm uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
                </div>
                <h3 className="text-2xl font-semibold text-brand-ink">{item.role}</h3>
                <p className="text-slate-700">{item.company}</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 sm:whitespace-nowrap">
                <AnimatedIcon
                  icon={Calendar}
                  size={14}
                  color="text-brand-teal"
                  animationType="none"
                  ariaLabel="Date range"
                />
                {item.dates}
              </div>
            </div>

            <ul className="mt-4 space-y-2 text-slate-700">
              {item.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 leading-relaxed">
                  <AnimatedIcon
                    icon={ArrowRight}
                    size={16}
                    color="text-brand-teal"
                    animationType="none"
                    ariaLabel={null}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Image Modal */}
      <ImageModal
        src={selectedImage}
        alt="Experience project screenshot"
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </div>
    </>
  )
}

export default Experiences
