const SCROLLSPY_ROOT_MARGIN = '0px 0px -80% 0px'

/**
 * Wires up the Profile page's sidebar nav: an IntersectionObserver-driven
 * scrollspy that toggles `.is-active` on whichever nav link corresponds to
 * the section currently occupying the top of the viewport (any section
 * whose bounds overlap the top 20%), and a cursor-following spotlight glow
 * that's purely decorative and independent of scroll position. Both read
 * from `[data-profile-side-nav]`, the nav element `PersonalInfoCard.jsx`
 * renders.
 */
export function initProfileSideNav(): void {
  const nav = document.querySelector<HTMLElement>('[data-profile-side-nav]')
  if (!nav) return

  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
  if (links.length === 0) return

  const sections = links
    .map((link) => document.getElementById(link.getAttribute('href')!.slice(1)))
    .filter((section): section is HTMLElement => section !== null)

  if (sections.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const activeId = entry.target.id
          links.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('href') === `#${activeId}`)
          })
        })
      },
      { rootMargin: SCROLLSPY_ROOT_MARGIN },
    )
    sections.forEach((section) => observer.observe(section))
  }

  nav.addEventListener('mousemove', (event) => {
    const rect = nav.getBoundingClientRect()
    nav.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
    nav.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
    nav.style.setProperty('--spot-opacity', '1')
  })

  nav.addEventListener('mouseleave', () => {
    nav.style.setProperty('--spot-opacity', '0')
  })
}
