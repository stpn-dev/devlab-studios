/**
 * Reveals every `[data-reveal]` element on the page once it scrolls into
 * view (fade + slide + slight scale, see the `.reveal-visible` CSS rule in
 * index.css). An optional `data-reveal-delay` attribute (milliseconds)
 * staggers a group of elements relative to each other. Elements are
 * unobserved after their first reveal — this never re-hides on scroll-out.
 */
export function initScrollReveal(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-reveal]')
  if (elements.length === 0) return

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const target = entry.target as HTMLElement
        const delay = target.getAttribute('data-reveal-delay')
        if (delay) target.style.transitionDelay = `${delay}ms`
        target.classList.add('reveal-visible')
        observer.unobserve(target)
      })
    },
    { threshold: 0.15 },
  )

  elements.forEach((element) => observer.observe(element))
}
