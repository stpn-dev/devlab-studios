/**
 * The detection vocabulary for deterministic signal extraction.
 *
 * Every pattern lives here rather than beside the code that uses it, for two
 * reasons: the extractors stay readable as logic instead of as walls of regex,
 * and adding a newly observed booking platform or portal phrasing is a
 * one-line change in a file whose whole job is to be edited.
 *
 * NOTHING in this file is vertical-specific. "Owner portal" and "tenant portal"
 * are here because they are generic operational-software terms that happen to
 * be common in property management; the campaign configuration is where a
 * vertical's own vocabulary belongs.
 */

/**
 * Script and iframe hosts that identify a third-party platform.
 *
 * Host matching rather than free-text search: a page that MENTIONS Calendly in
 * a blog post has not integrated Calendly, and the difference matters because
 * a false "already has scheduling" costs a lead its workflow-opportunity score.
 */
export const TECHNOLOGY_HOSTS = Object.freeze({
  scheduling: Object.freeze({
    'calendly.com': 'Calendly',
    'assets.calendly.com': 'Calendly',
    'acuityscheduling.com': 'Acuity Scheduling',
    'squarespacescheduling.com': 'Acuity Scheduling',
    'app.squarespacescheduling.com': 'Acuity Scheduling',
    'youcanbook.me': 'YouCanBook.me',
    'setmore.com': 'Setmore',
    'simplybook.me': 'SimplyBook.me',
    'bookingkoala.com': 'BookingKoala',
    'housecallpro.com': 'Housecall Pro',
    'meetings.hubspot.com': 'HubSpot Meetings',
    'cal.com': 'Cal.com',
    'appointlet.com': 'Appointlet',
    'schedulicity.com': 'Schedulicity',
  }),
  chat: Object.freeze({
    'widget.intercom.io': 'Intercom',
    'js.intercomcdn.com': 'Intercom',
    'embed.tawk.to': 'Tawk.to',
    'static.zdassets.com': 'Zendesk Chat',
    'widget-mediator.zopim.com': 'Zendesk Chat',
    'js.driftt.com': 'Drift',
    'client.crisp.chat': 'Crisp',
    'connect.podium.com': 'Podium',
    'widget.manychat.com': 'ManyChat',
    'cdn.livechatinc.com': 'LiveChat',
    'js.hs-scripts.com': 'HubSpot',
    'embed.small.chat': 'Small Chat',
    'chat-assets.frontapp.com': 'Front Chat',
  }),
  crm_marketing: Object.freeze({
    'js.hs-scripts.com': 'HubSpot',
    'js.hsforms.net': 'HubSpot Forms',
    'js.hscollectedforms.net': 'HubSpot',
    'assets.salesforce.com': 'Salesforce',
    'webforms.pipedrive.com': 'Pipedrive',
    'munchkin.marketo.net': 'Marketo',
    'cdn.pardot.com': 'Pardot',
    'static.klaviyo.com': 'Klaviyo',
    'js.activecampaign.com': 'ActiveCampaign',
    'app-*.marketingautomation.services': 'SharpSpring',
    'cdn.mktoweb.com': 'Marketo',
    'forms.zohopublic.com': 'Zoho Forms',
    'crm.zoho.com': 'Zoho CRM',
    'app.keap.com': 'Keap',
    'link.msgsndr.com': 'GoHighLevel',
    'cdn.jotfor.ms': 'Jotform',
    'form.typeform.com': 'Typeform',
    'embed.typeform.com': 'Typeform',
  }),
  analytics: Object.freeze({
    'www.googletagmanager.com': 'Google Tag Manager',
    'www.google-analytics.com': 'Google Analytics',
    'connect.facebook.net': 'Meta Pixel',
    'static.hotjar.com': 'Hotjar',
  }),
})

/**
 * Platform fingerprints, matched against markup rather than script hosts.
 *
 * Each entry is `[label, RegExp]`. Deliberately narrow — a generator meta tag
 * or a framework-specific path, not a guess from a class name.
 */
export const PLATFORM_SIGNATURES = Object.freeze([
  ['WordPress', /<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i],
  ['WordPress', /\/wp-(?:content|includes)\//i],
  ['Squarespace', /<!--\s*This is Squarespace\.|static1?\.squarespace\.com/i],
  ['Wix', /<meta[^>]+content=["']Wix\.com|static\.wixstatic\.com/i],
  ['Webflow', /<html[^>]+data-wf-(?:page|site)|assets(?:-global)?\.website-files\.com/i],
  ['Shopify', /cdn\.shopify\.com|Shopify\.theme/i],
  ['Duda', /<meta[^>]+content=["']Duda|irp-cdn\.multiscreensite\.com/i],
  ['GoDaddy Website Builder', /godaddysites\.com|<meta[^>]+content=["']Starfield/i],
  ['HubSpot CMS', /<meta[^>]+name=["']generator["'][^>]+content=["']HubSpot/i],
  ['Drupal', /<meta[^>]+name=["']Generator["'][^>]+content=["']Drupal/i],
  ['Joomla', /<meta[^>]+name=["']generator["'][^>]+content=["']Joomla/i],
  ['Next.js', /\/_next\/static\/|id=["']__NEXT_DATA__["']/],
  ['Nuxt', /\/_nuxt\/|id=["']__NUXT__["']/],
  ['React', /data-reactroot|id=["']root["'][^>]*>\s*<\/div>/],
])

/**
 * Phrases that indicate a step a person has to do by hand.
 *
 * Grouped by the operational concept each points at, so the extractor can
 * report "more than one manual workflow" rather than "eleven phrase matches" —
 * eleven variations of "call us" is one manual workflow, not eleven.
 */
export const MANUAL_WORKFLOW_PHRASES = Object.freeze({
  email_intake: Object.freeze([
    'email us', 'e-mail us', 'send us an email', 'email your', 'send an email to',
    'email the completed', 'reply to this email with', 'email us your',
  ]),
  phone_intake: Object.freeze([
    'call us', 'call our office', 'give us a call', 'phone our office',
    'call today', 'call to schedule', 'call for a quote', 'call for pricing',
    'call to discuss', 'speak to our team',
  ]),
  form_download: Object.freeze([
    'download the form', 'download this form', 'download our application',
    'download and complete', 'print and sign', 'print, sign', 'fill out and return',
    'complete and return', 'download the pdf', 'downloadable form',
  ]),
  in_person: Object.freeze([
    'visit our office', 'come into our office', 'stop by our office',
    'drop off at our office', 'bring it to our office', 'in person at our office',
  ]),
  fax: Object.freeze(['fax the', 'fax to', 'fax your', 'fax completed']),
  manual_request: Object.freeze([
    'contact our office', 'request a consultation', 'request a callback',
    'request more information', 'inquire about availability',
    'contact us for pricing', 'contact us for availability', 'contact us to schedule',
  ]),
})

/**
 * Operational surfaces worth noticing. A portal or a structured form is
 * evidence of an existing process, which is what makes an integration
 * conversation concrete rather than speculative.
 */
export const OPERATIONS_PHRASES = Object.freeze({
  CUSTOMER_PORTAL: Object.freeze(['customer portal', 'client portal', 'customer login', 'client login']),
  OWNER_PORTAL: Object.freeze(['owner portal', 'owner login', 'owner dashboard']),
  TENANT_PORTAL: Object.freeze(['tenant portal', 'resident portal', 'tenant login', 'resident login']),
  APPLICATION_FORM: Object.freeze(['application form', 'apply online', 'rental application', 'submit an application', 'online application']),
  QUOTE_REQUEST_FORM: Object.freeze(['request a quote', 'get a quote', 'free quote', 'request an estimate', 'free estimate', 'request a proposal']),
  MAINTENANCE_REQUEST: Object.freeze(['maintenance request', 'service request', 'submit a request', 'report an issue', 'work order']),
})

/**
 * Words that suggest multiple distinct audiences, which usually means multiple
 * distinct intake processes.
 */
export const AUDIENCE_TERMS = Object.freeze([
  'owners', 'tenants', 'residents', 'landlords', 'investors', 'buyers', 'sellers',
  'vendors', 'contractors', 'homeowners', 'businesses', 'clients', 'patients',
  'members', 'partners', 'applicants',
])

/**
 * Local parts and domains that are never a business contact, applied on top of
 * the configured exclusions.
 *
 * Example/placeholder addresses matter more than they look: a template site
 * that never had its placeholder replaced will happily hand over
 * `you@example.com`, and storing it would produce a lead that looks contactable
 * and is not.
 */
export const NON_CONTACT_EMAIL_PATTERNS = Object.freeze([
  /@(?:example|test|localhost|domain|yourdomain|email|company|sentry|wixpress)\.(?:com|org|net|io)$/i,
  /^(?:your|you|name|firstname|lastname|user|username|someone|email|sample|test)@/i,
  /@\d+x\./i,
  /\.(?:png|jpe?g|gif|svg|webp|css|js)$/i,
  /^[0-9a-f]{20,}@/i,
])

/** North American and international phone shapes, deliberately conservative. */
export const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b|\+(\d{1,3})[\s.-]?(\d[\d\s.-]{6,14}\d)/g

/** RFC-ish address shape. Intentionally stricter than the RFC: this finds
 *  addresses in prose, where the exotic legal forms never appear and matching
 *  them produces noise. */
export const EMAIL_PATTERN = /\b[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,24})+\b/gi
