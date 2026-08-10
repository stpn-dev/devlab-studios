import ResponsivePicture from './ResponsivePicture'

/**
 * @param {{
 *   project: import('../lib/content/projects').ProjectData,
 *   onClick: () => void,
 * }} props
 */
function PortfolioCard({ project, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="portfolio-card-slide block w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 text-left shadow-[0_14px_32px_rgba(60,28,120,0.16)] transition-transform hover:-translate-y-1"
      aria-label={`View ${project.title} project details`}
    >
      <ResponsivePicture
        image={project.optimizedImage}
        alt={`${project.title} cover`}
        className="h-[200px] w-full object-cover"
      />
      <div className="p-4">
        <h3 className="text-base font-semibold text-white">{project.title}</h3>
      </div>
    </button>
  )
}

export default PortfolioCard
