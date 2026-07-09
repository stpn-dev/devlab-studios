import { useState } from 'react'
import PageSeo from '../components/PageSeo'
import SectionHeader from '../components/SectionHeader'
import PersonalInfoCard from '../components/PersonalInfoCard'
import PortfolioRow from '../components/PortfolioRow'
import ImageModal from '../components/ImageModal'
import SkillsSection from '../components/ui/SkillsSection'
import SystemsPanel from '../components/ui/SystemsPanel'
import ListItemWithIcon from '../components/ui/ListItemWithIcon'
import AnimatedIcon from '../components/icons/AnimatedIcon'
import { ArrowRight, BadgeCheck, Briefcase, Calendar, GraduationCap, Trophy } from '../components/icons/icons'
import { useProjects } from '../hooks/useProjects'
import { useProfileContent } from '../hooks/useProfileContent'

function Profile() {
  const [selectedImage, setSelectedImage] = useState(null)
  const [category, setCategory] = useState('Automation')
  const projects = useProjects()
  const profileContent = useProfileContent()
  const aboutData = profileContent.about || {}
  const experiences = profileContent.experiences || []

  const categories = [
    { label: 'Automation Buildouts', value: 'Automation' },
    { label: 'Website Buildouts', value: 'Website' },
  ]

  const filteredItems = projects.filter((item) =>
    category === 'Website'
      ? item.type === 'Website'
      : item.type === 'Automation',
  )

  return (
    <>
      <PageSeo pageSlug="profile" />

      <div className="space-y-10">
        <SectionHeader
          title="Profile"
          subtitle="Founder background, technical experience, and selected website and automation projects."
        />

        <PersonalInfoCard aboutData={aboutData} />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
            <h3 className="text-xl font-semibold text-brand-ink">Career Objectives</h3>
            <p className="mt-3 text-slate-700">{aboutData.careerObjectives}</p>
          </section>
          <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
            <h3 className="text-xl font-semibold text-brand-ink">Short Bio</h3>
            <p className="mt-3 text-slate-700">{aboutData.shortBio}</p>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
            <h3 className="text-xl font-semibold text-brand-ink">Education</h3>
            <ul className="mt-3 space-y-3 text-slate-700">
              {aboutData.education?.map((item) => (
                <ListItemWithIcon icon={GraduationCap} key={`${item.school}-${item.years}`}>
                  <span className="font-bold text-brand-ink">{item.school}</span><br />
                  <span>{item.program}</span><br />
                  <span className="text-sm text-slate-500">{item.years}</span>
                </ListItemWithIcon>
              ))}
            </ul>
          </section>

          <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7 lg:col-span-2">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-xl font-semibold text-brand-ink">Achievements & Responsibilities</h3>
                <ul className="mt-3 space-y-3 text-slate-700">
                  {aboutData.achievementsAndResponsibilities?.map((item) => (
                    <ListItemWithIcon icon={Trophy} key={item.title}>
                      <span className="font-semibold">{item.title}:</span> {item.details}
                    </ListItemWithIcon>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-brand-ink">Certificates & Licenses</h3>
                <ul className="mt-3 space-y-3 text-slate-700">
                  {aboutData.certificatesAndLicenses?.map((cert) => (
                    <ListItemWithIcon icon={BadgeCheck} key={cert}>
                      {cert}
                    </ListItemWithIcon>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-4">
          <SectionHeader
            title="Experience"
            subtitle="Roles and work history that shaped my software, automation, and operations background."
          />
          <div className="space-y-6">
            {experiences.map((item) => (
              <section key={item.id} className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <AnimatedIcon icon={Briefcase} size={16} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
                      <p className="text-sm uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
                    </div>
                    <h3 className="text-2xl font-semibold text-brand-ink">{item.role}</h3>
                    <p className="text-slate-700">{item.company}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 sm:whitespace-nowrap">
                    <AnimatedIcon icon={Calendar} size={14} color="text-brand-teal" animationType="none" ariaLabel="Date range" />
                    {item.dates}
                  </div>
                </div>

                <ul className="mt-4 space-y-2 text-slate-700">
                  {item.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 leading-relaxed">
                      <AnimatedIcon icon={ArrowRight} size={16} color="text-brand-teal" animationType="none" ariaLabel={null} className="mt-0.5 flex-shrink-0" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <SkillsSection
          technicalSkills={profileContent.skills?.technical || []}
          personalSkills={profileContent.skills?.personal || []}
        />

        <section className="space-y-4">
          <SectionHeader
            title="Systems & Workflows"
            subtitle="Core tools, repeatable workflow patterns, and operating characteristics used across delivery."
          />
          <SystemsPanel
            tools={profileContent.tools || []}
            workflowPatterns={profileContent.workflowPatterns || []}
            systemCharacteristics={profileContent.systemCharacteristics || []}
          />
        </section>

        <section className="space-y-6">
          <SectionHeader
            title="Portfolio"
            subtitle="Selected website buildouts, automation workflows, and interface samples."
          />

          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                className={`rounded-full px-4 py-2 font-semibold transition-colors duration-200 ${
                  category === cat.value ? 'bg-brand-teal text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-brand-ink'
                }`}
                onClick={() => setCategory(cat.value)}
                type="button"
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {filteredItems.map((project) => (
              <PortfolioRow
                key={project.id}
                project={project}
                onImageClick={(image) => setSelectedImage(image)}
              />
            ))}
          </div>

          <ImageModal
            src={selectedImage?.url || ''}
            alt={selectedImage?.altText || 'Portfolio project screenshot'}
            isOpen={!!selectedImage}
            onClose={() => setSelectedImage(null)}
            caption={selectedImage?.altText || ''}
          />
        </section>
      </div>
    </>
  )
}

export default Profile
