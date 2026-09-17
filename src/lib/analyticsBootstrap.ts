import { initAttribution, track } from './analytics'

/**
 * One delegated listener for every CTA on the page, instead of a hydrated
 * island per button.
 *
 * The buttons themselves stay plain server-rendered anchors — they work,
 * focus, and navigate with no JavaScript at all. Adding `data-cta-id` to one
 * is the entire opt-in, so a new CTA is tracked by adding an attribute rather
 * than by wrapping it in a component.
 *
 * Only identifiers are read from the DOM. Link text is never sent.
 */
function readContext(element: HTMLElement) {
  return {
    cta_id: element.dataset.ctaId || '',
    component_id: element.dataset.ctaId || '',
    solution_id: element.dataset.solutionId || undefined,
    case_study_id: element.dataset.caseStudyId || undefined,
    insight_id: element.dataset.insightId || undefined,
    offer_id: element.dataset.offerId || undefined,
    inquiry_type: element.dataset.inquiryType || undefined,
  }
}

export function initAnalytics(): void {
  if (typeof document === 'undefined') return

  initAttribution()

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null
      const trigger = target?.closest<HTMLElement>('[data-cta-id]')
      if (!trigger) return

      const variant = trigger.dataset.ctaVariant === 'secondary' ? 'secondary_cta_click' : 'primary_cta_click'
      track(variant, readContext(trigger))
    },
    // Capture phase: a click that navigates away can otherwise unload the page
    // before a bubbled listener ever runs.
    { capture: true },
  )

  // Outbound contact links (mailto:, tel:, and the résumé) are the other
  // conversion-adjacent action worth knowing about.
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null
      const link = target?.closest<HTMLAnchorElement>('a[href]')
      if (!link) return

      const href = link.getAttribute('href') || ''
      if (href.startsWith('mailto:') || href.startsWith('tel:')) {
        track('outbound_contact_click', { component_id: link.dataset.ctaId || 'contact-link' })
      } else if (href === '/resume.pdf') {
        track('resume_download', { component_id: link.dataset.ctaId || 'resume-link' })
      }
    },
    { capture: true },
  )
}

/**
 * Fires once per page for sections whose visibility is itself the signal —
 * a solution card scrolled into view, a case study read, an insight opened.
 * Uses IntersectionObserver so nothing is reported for content that was
 * rendered but never actually seen.
 */
export function initViewTracking(): void {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

  const nodes = document.querySelectorAll<HTMLElement>('[data-view-event]')
  if (!nodes.length) return

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const element = entry.target as HTMLElement
        observer.unobserve(element)
        const eventName = element.dataset.viewEvent
        if (!eventName) continue
        track(eventName as Parameters<typeof track>[0], readContext(element))
      }
    },
    { threshold: 0.4 },
  )

  nodes.forEach((node) => observer.observe(node))
}
