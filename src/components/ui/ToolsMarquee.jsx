import * as Icons from '../icons/icons'

function resolveIcon(name) {
  return Icons[name] || Icons.Lightbulb
}

/**
 * @param {{ tools: Array<{ key: string, label: string, icon: string, logo?: string }> }} props
 */
function ToolsMarquee({ tools }) {
  const midpoint = Math.ceil(tools.length / 2)
  const rowOne = tools.slice(0, midpoint)
  const rowTwo = tools.slice(midpoint)

  function renderRow(items, direction) {
    // Duplicated once so the CSS animation's -50% translation loops seamlessly.
    const doubled = [...items, ...items]
    return (
      <div className="tools-marquee-track">
        <div className={`tools-marquee-row tools-marquee-row--${direction}`}>
          {doubled.map((tool, index) => {
            const Icon = resolveIcon(tool.icon)
            return (
              <div key={`${tool.key}-${index}`} className="tools-marquee-item">
                {tool.logo ? (
                  <img src={tool.logo} alt="" width={30} height={30} className="tools-marquee-logo" />
                ) : (
                  <Icon className="tools-marquee-logo" aria-hidden="true" />
                )}
                <span>{tool.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="tools-marquee-wrap">
      {renderRow(rowOne, 'right')}
      {renderRow(rowTwo, 'left')}
    </div>
  )
}

export default ToolsMarquee
