const SCROLLSPY_ROOT_MARGIN = '0px 0px -80% 0px'

/**
 * Wires up the Profile page's sidebar nav and page-wide cursor glow.
 *
 * Scrollspy: an IntersectionObserver toggles `.is-active`/`aria-current` on
 * whichever nav link corresponds to the section currently occupying the top
 * of the viewport (any section whose bounds overlap the top 20%). Reads
 * links/sections from `[data-profile-side-nav]`.
 *
 * Cursor glow: a soft spotlight that follows the mouse across the whole
 * page, purely decorative and independent of scroll position. Reads/writes
 * `[data-page-spotlight]`, a fixed full-viewport overlay.
 */
export function initProfileSideNav(): void {
  const nav = document.querySelector<HTMLElement>('[data-profile-side-nav]')
  if (nav) {
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    const sections = links
      .map((link) => document.getElementById(link.getAttribute('href')!.slice(1)))
      .filter((section): section is HTMLElement => section !== null)

    if (links.length > 0 && sections.length > 0) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            const activeId = entry.target.id
            links.forEach((link) => {
              const isActive = link.getAttribute('href') === `#${activeId}`
              link.classList.toggle('is-active', isActive)
              if (isActive) {
                link.setAttribute('aria-current', 'true')
              } else {
                link.removeAttribute('aria-current')
              }
            })
          })
        },
        { rootMargin: SCROLLSPY_ROOT_MARGIN },
      )
      sections.forEach((section) => observer.observe(section))
    }
  }

  const spotlight = document.querySelector<HTMLElement>('[data-page-spotlight]')
  if (!spotlight) return

  document.addEventListener('mousemove', (event) => {
    spotlight.style.setProperty('--spot-x', `${event.clientX}px`)
    spotlight.style.setProperty('--spot-y', `${event.clientY}px`)
    spotlight.style.setProperty('--spot-opacity', '1')
  })

  document.documentElement.addEventListener('mouseleave', () => {
    spotlight.style.setProperty('--spot-opacity', '0')
  })
}
