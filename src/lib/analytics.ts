/**
 * Browser-side analytics and attribution.
 *
 * Wraps the GA4 `gtag` already loaded by Layout.astro. Two rules are
 * structural rather than conventional here:
 *
 *  1. No personal data ever leaves this module. Names, email addresses,
 *     message bodies, phone numbers, and company names are never accepted as
 *     event parameters — the event shape below has no field for them. The only
 *     identifier sent is a random first-party `anonymousId`.
 *
 *  2. A conversion is only reported after the SERVER confirms persistence.
 *     `inquirySubmit` fires on the attempt; `inquiryPersisted` is the actual
 *     conversion and is called only when the API responded `persisted: true`.
 *     Reporting on the click would count submissions the database never
 *     received.
 */

export const ANALYTICS_EVENTS = [
  'page_view',
  'primary_cta_click',
  'secondary_cta_click',
  'solution_view',
  'case_study_view',
  'case_study_cta_click',
  'insight_view',
  'lead_magnet_view',
  'lead_magnet_submit',
  'business_form_start',
  'business_form_step_complete',
  'employment_form_start',
  'form_validation_error',
  'inquiry_submit',
  'inquiry_persisted',
  'inquiry_failure',
  'resume_download',
  'outbound_contact_click',
] as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

/** The complete set of parameters any event may carry. Nothing else is sent. */
export interface AnalyticsParams {
  page_path?: string
  component_id?: string
  cta_id?: string
  inquiry_type?: string
  form_id?: string
  form_step?: number
  offer_id?: string
  solution_id?: string
  case_study_id?: string
  insight_id?: string
  field?: string
  reason?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  anonymous_id?: string
}

const ANONYMOUS_ID_KEY = 'devlab.aid'
const FIRST_TOUCH_KEY = 'devlab.first_touch'
const ENTRY_PAGE_KEY = 'devlab.entry_page'

interface StoredTouch {
  source: string
  medium: string
  campaign: string
  at: string
}

export interface AttributionPayload {
  entryPage: string
  sourcePage: string
  landingPage: string
  referrer: string
  firstTouchSource: string
  firstTouchMedium: string
  firstTouchCampaign: string
  firstTouchAt: string
  latestTouchSource: string
  latestTouchMedium: string
  latestTouchCampaign: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmTerm: string
  utmContent: string
  formId: string
  offerId: string
  solutionId: string
  caseStudyId: string
  insightId: string
  anonymousId: string
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * Storage access throws in a private window, with site data blocked, and
 * inside some embedded webviews. Every read and write is guarded so a
 * storage-hostile browser degrades to "no attribution" rather than a broken
 * form.
 */
function safeRead(storage: 'local' | 'session', key: string): string {
  if (!isBrowser()) return ''
  try {
    const store = storage === 'local' ? window.localStorage : window.sessionStorage
    return store.getItem(key) || ''
  } catch {
    return ''
  }
}

function safeWrite(storage: 'local' | 'session', key: string, value: string): void {
  if (!isBrowser()) return
  try {
    const store = storage === 'local' ? window.localStorage : window.sessionStorage
    store.setItem(key, value)
  } catch {
    /* storage unavailable — attribution degrades, the form still works */
  }
}

/**
 * A random, first-party, per-browser id. Not derived from anything about the
 * visitor: no IP, no user agent, no email, no canvas or device signal. It
 * exists only to join a submission to the page views that preceded it.
 */
export function getAnonymousId(): string {
  if (!isBrowser()) return ''
  const existing = safeRead('local', ANONYMOUS_ID_KEY)
  if (existing) return existing

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

  safeWrite('local', ANONYMOUS_ID_KEY, generated)
  return generated
}

function readCurrentTouch(): StoredTouch {
  if (!isBrowser()) return { source: '', medium: '', campaign: '', at: '' }
  const params = new URLSearchParams(window.location.search)
  const source = params.get('utm_source') || ''
  const medium = params.get('utm_medium') || ''
  const campaign = params.get('utm_campaign') || ''

  if (source || medium || campaign) {
    return { source, medium, campaign, at: new Date().toISOString() }
  }

  // No campaign parameters: fall back to the referring host so organic and
  // referral traffic is still attributable, without storing a full URL.
  const referrer = document.referrer
  if (referrer) {
    try {
      const host = new URL(referrer).hostname
      if (host && host !== window.location.hostname) {
        return { source: host, medium: 'referral', campaign: '', at: new Date().toISOString() }
      }
    } catch {
      /* malformed referrer — treated as direct */
    }
  }

  return { source: 'direct', medium: 'none', campaign: '', at: new Date().toISOString() }
}

/** Records first-touch and entry page exactly once per browser/session. */
export function initAttribution(): void {
  if (!isBrowser()) return

  if (!safeRead('local', FIRST_TOUCH_KEY)) {
    safeWrite('local', FIRST_TOUCH_KEY, JSON.stringify(readCurrentTouch()))
  }
  if (!safeRead('session', ENTRY_PAGE_KEY)) {
    safeWrite('session', ENTRY_PAGE_KEY, window.location.pathname)
  }
  getAnonymousId()
}

function parseFirstTouch(): StoredTouch {
  const raw = safeRead('local', FIRST_TOUCH_KEY)
  if (!raw) return { source: '', medium: '', campaign: '', at: '' }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTouch>
    return {
      source: String(parsed.source || ''),
      medium: String(parsed.medium || ''),
      campaign: String(parsed.campaign || ''),
      at: String(parsed.at || ''),
    }
  } catch {
    return { source: '', medium: '', campaign: '', at: '' }
  }
}

/**
 * The attribution block posted alongside a submission. The visitor is never
 * asked for any of it, and the server re-validates and length-caps every
 * field before storing it.
 */
export function collectAttribution(context: {
  formId?: string
  offerId?: string
  solutionId?: string
  caseStudyId?: string
  insightId?: string
} = {}): AttributionPayload {
  if (!isBrowser()) {
    return {
      entryPage: '', sourcePage: '', landingPage: '', referrer: '',
      firstTouchSource: '', firstTouchMedium: '', firstTouchCampaign: '', firstTouchAt: '',
      latestTouchSource: '', latestTouchMedium: '', latestTouchCampaign: '',
      utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: '',
      formId: context.formId || '', offerId: context.offerId || '',
      solutionId: context.solutionId || '', caseStudyId: context.caseStudyId || '',
      insightId: context.insightId || '', anonymousId: '',
    }
  }

  const params = new URLSearchParams(window.location.search)
  const firstTouch = parseFirstTouch()
  const latestTouch = readCurrentTouch()

  return {
    entryPage: safeRead('session', ENTRY_PAGE_KEY) || window.location.pathname,
    sourcePage: window.location.pathname,
    landingPage: window.location.pathname,
    // Host only — a full referring URL can carry query strings belonging to
    // another site, which is more than is needed to attribute a visit.
    referrer: document.referrer ? safeHost(document.referrer) : '',
    firstTouchSource: firstTouch.source,
    firstTouchMedium: firstTouch.medium,
    firstTouchCampaign: firstTouch.campaign,
    firstTouchAt: firstTouch.at,
    latestTouchSource: latestTouch.source,
    latestTouchMedium: latestTouch.medium,
    latestTouchCampaign: latestTouch.campaign,
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
    utmTerm: params.get('utm_term') || '',
    utmContent: params.get('utm_content') || '',
    formId: context.formId || '',
    offerId: context.offerId || '',
    solutionId: context.solutionId || '',
    caseStudyId: context.caseStudyId || '',
    insightId: context.insightId || '',
    anonymousId: getAnonymousId(),
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

type GtagFunction = (command: string, eventName: string, params?: Record<string, unknown>) => void

/**
 * Emits one event. Silent no-op when gtag has not loaded (it is deliberately
 * deferred to idle in Layout.astro), so analytics can never block or break an
 * interaction.
 */
export function track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (!isBrowser()) return
  const gtag = (window as unknown as { gtag?: GtagFunction }).gtag
  if (typeof gtag !== 'function') return

  try {
    gtag('event', event, {
      page_path: window.location.pathname,
      anonymous_id: getAnonymousId(),
      ...params,
    })
  } catch {
    /* analytics must never surface as a user-visible error */
  }
}

/** Conversion. Called only after the server confirmed the inquiry was stored. */
export function trackInquiryPersisted(params: AnalyticsParams): void {
  track('inquiry_persisted', params)
}
