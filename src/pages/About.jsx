import SectionHeader from '../components/SectionHeader'
import PersonalInfoCard from '../components/PersonalInfoCard'
import aboutData from '../data/about.js'
import { experiences } from '../data/experiences'
import SkillsSection from '../components/ui/SkillsSection'
import ListItemWithIcon from '../components/ui/ListItemWithIcon'
import AnimatedIcon from '../components/icons/AnimatedIcon'
import { GraduationCap, Trophy, BadgeCheck, Briefcase, Calendar, ArrowRight } from '../components/icons/icons'
import { Helmet } from 'react-helmet-async'

function About() {
  return (
    <>
      <Helmet>
        <title>About Devlab Studios – Software Engineer &amp; AI Automation Specialist</title>
        <meta name="description" content="Learn about Devlab Studios — a software engineer and AI automation specialist based in the Philippines, available for remote work worldwide. Experience spans Java, Spring Boot, Laravel, React, Next.js, REST APIs, and workflow automation." />
        <meta name="keywords" content="software engineer Philippines, AI automation specialist, Java Spring Boot developer, Laravel developer, React developer, Next.js developer, API integration specialist, remote software engineer" />
        <meta property="og:title" content="About Devlab Studios – Software Engineer &amp; AI Automation Specialist" />
        <meta property="og:description" content="Devlab Studios — software engineer and AI automation specialist. Java, Spring Boot, Laravel, React, Next.js, APIs, and workflow automation. Available for remote work worldwide." />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content="https://www.devlabstudios.com/about" />
        <meta property="og:image" content="/screenshots/portfolio-about.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Devlab Studios – Software Engineer &amp; AI Automation Specialist" />
        <meta name="twitter:description" content="Devlab Studios — software engineer and AI automation specialist. Java, Spring Boot, Laravel, React, Next.js, and workflow automation." />
        <meta name="twitter:image" content="/screenshots/portfolio-about.png" />
      </Helmet>
    <div className="space-y-10">
      <SectionHeader
        title="About Me"
        subtitle="A concise overview of how I work across software engineering, automation delivery, and operational problem solving."
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
            {aboutData.education && aboutData.education.map((item, idx) => (
              <ListItemWithIcon icon={GraduationCap} key={idx}>
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
                {aboutData.achievementsAndResponsibilities && aboutData.achievementsAndResponsibilities.map((item, idx) => (
                  <ListItemWithIcon icon={Trophy} key={idx}>
                    <span className="font-semibold">{item.title}:</span> {item.details}
                  </ListItemWithIcon>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-brand-ink">Certificates & Licenses</h3>
              <ul className="mt-3 space-y-3 text-slate-700">
                {aboutData.certificatesAndLicenses && aboutData.certificatesAndLicenses.map((cert, idx) => (
                  <ListItemWithIcon icon={BadgeCheck} key={idx}>
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
          subtitle="A condensed view of the roles and work history that shaped my software, automation, and operations background."
        />
        <div className="space-y-6">
          {experiences.map((item) => (
            <section key={item.id} className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
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
      </section>

      {/* Skills Section */}
        <SkillsSection />
        
    </div>
    </>
  )
}

export default About
