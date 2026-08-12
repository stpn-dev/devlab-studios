import * as Icons from '../icons/icons'

const ROW_COUNT = 4
const ROW_DURATIONS_SECONDS = [30, 34, 38, 42]

function resolveIcon(name) {
  return Icons[name] || Icons.Lightbulb
}

/**
 * @param {Array<{ key: string, label: string, icon: string, logo?: string }>} tools
 * @param {number} rowCount
 * @returns {Array<Array<{ key: string, label: string, icon: string, logo?: string }>>}
 */
function splitIntoRows(tools, rowCount) {
  const base = Math.floor(tools.length / rowCount)
  const remainder = tools.length % rowCount
  const rows = []
  let start = 0
  for (let index = 0; index < rowCount; index += 1) {
    const size = base + (index < remainder ? 1 : 0)
    rows.push(tools.slice(start, start + size))
    start += size
  }
  return rows.filter((row) => row.length > 0)
}

/**
 * @param {{ tools: Array<{ key: string, label: string, icon: string, logo?: string }> }} props
 */
function ToolsMarquee({ tools }) {
  const rows = splitIntoRows(tools, ROW_COUNT)

  function renderRow(items, rowIndex) {
    const direction = rowIndex % 2 === 0 ? 'right' : 'left'
    const durationSeconds = ROW_DURATIONS_SECONDS[rowIndex % ROW_DURATIONS_SECONDS.length]
    // Duplicated once so the CSS animation's -50% translation loops seamlessly.
    const doubled = [...items, ...items]
    return (
      <div className="tools-marquee-track" key={rowIndex}>
        <div
          className={`tools-marquee-row tools-marquee-row--${direction}`}
          style={{ animationDuration: `${durationSeconds}s` }}
        >
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
      {rows.map((row, index) => renderRow(row, index))}
    </div>
  )
}

export default ToolsMarquee
