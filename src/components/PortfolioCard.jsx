import ResponsivePicture from './ResponsivePicture'

/**
 * @param {{
 *   project: import('../lib/content/projects').ProjectData,
 *   onClick: () => void,
 *   shouldLoadImage?: boolean,
 * }} props
 */
function PortfolioCard({ project, onClick, shouldLoadImage = true }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="portfolio-card-slide block w-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 text-left shadow-[0_18px_45px_rgba(60,28,120,0.14)]"
      aria-label={`View ${project.title} project details`}
    >
      {shouldLoadImage ? (
        <ResponsivePicture
          image={project.optimizedImage}
          alt={`${project.title} cover`}
          className="h-[150px] w-full object-cover"
        />
      ) : (
        <div className="h-[150px] w-full bg-slate-200/60" aria-hidden="true" />
      )}
      <div className="p-4">
        <h3 className="text-base font-semibold text-brand-ink">{project.title}</h3>
      </div>
    </button>
  )
}

export default PortfolioCard
