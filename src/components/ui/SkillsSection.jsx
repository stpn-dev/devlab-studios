function SkillBadge({ skill }) {
  return (
    <span className="bg-white/90 border border-slate-200 text-slate-700 px-3 py-1 rounded-full text-sm font-medium mr-2 mb-2 inline-block transition-transform duration-200 hover:scale-105 hover:border-brand-orange/40 hover:text-brand-ink">
      {skill}
    </span>
  )
}

/**
 * @param {object} props
 * @param {string[]} [props.technicalSkills]
 * @param {string[]} [props.personalSkills]
 */
function SkillsSection({ technicalSkills = [], personalSkills = [] }) {
  return (
    <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
      <h3 className="text-xl font-semibold text-brand-ink mb-4">Skills</h3>
      <div className="mb-5">
        <h4 className="text-base font-semibold text-slate-700 mb-2">Technical Skills</h4>
        <div className="flex flex-wrap">
          {technicalSkills.map((skill, idx) => (
            <SkillBadge skill={skill} key={idx} />
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-base font-semibold text-slate-700 mb-2">Personal Skills</h4>
        <div className="flex flex-wrap">
          {personalSkills.map((skill, idx) => (
            <SkillBadge skill={skill} key={idx} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default SkillsSection
