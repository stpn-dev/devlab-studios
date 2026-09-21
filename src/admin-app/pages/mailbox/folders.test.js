import { describe, expect, it } from 'vitest'
import { FOLDERS, MACHINE_FOLDERS, SECTION_KEYS, resolveMailboxSection, sectionFor } from './folders.js'

/**
 * The active-section resolver.
 *
 * THIS EXISTS BECAUSE TWO FOLDERS USED TO LIGHT UP AT ONCE. Machine mail was
 * reached as `/admin/mailbox/inbox?mailbox=bounce`, and react-router's NavLink
 * decides `isActive` from the pathname alone — so Inbox matched, Bounces
 * matched the same pathname, and both rendered selected. Each link was deciding
 * its own highlight with no shared source of truth.
 *
 * Every case below asserts the same property from a different angle: for any
 * location, EXACTLY ONE section is active.
 */

const ALL = [...FOLDERS, ...MACHINE_FOLDERS].map((folder) => folder.key).concat('diagnostics')

/** How many rail entries would light up for a location. */
function activeCount(location) {
  const active = resolveMailboxSection(location)
  return ALL.filter((key) => key === active).length
}

describe('resolveMailboxSection', () => {
  it('resolves each folder route to itself and nothing else', () => {
    for (const key of ALL) {
      const location = { pathname: `/admin/mailbox/${key}`, search: '' }
      expect(resolveMailboxSection(location), `${key} must resolve to itself`).toBe(key)
      expect(activeCount(location), `${key} must light exactly one entry`).toBe(1)
    }
  })

  it('never lights two entries, whatever the location', () => {
    const locations = [
      { pathname: '/admin/mailbox', search: '' },
      { pathname: '/admin/mailbox/', search: '' },
      { pathname: '/admin/mailbox/inbox', search: '' },
      { pathname: '/admin/mailbox/inbox', search: '?mailbox=bounce' },
      { pathname: '/admin/mailbox/inbox', search: '?mailbox=dmarc' },
      { pathname: '/admin/mailbox/bounces', search: '' },
      { pathname: '/admin/mailbox/dmarc', search: '' },
      { pathname: '/admin/mailbox/diagnostics', search: '' },
      { pathname: '/admin/mailbox/sent', search: '?search=anything' },
      { pathname: '/admin/mailbox/nonsense', search: '' },
    ]

    for (const location of locations) {
      expect(activeCount(location), `${location.pathname}${location.search}`).toBe(1)
    }
  })

  it('gives Bounces and DMARC the highlight on their own routes, NOT Inbox', () => {
    expect(resolveMailboxSection({ pathname: '/admin/mailbox/bounces', search: '' })).toBe('bounces')
    expect(resolveMailboxSection({ pathname: '/admin/mailbox/dmarc', search: '' })).toBe('dmarc')

    expect(resolveMailboxSection({ pathname: '/admin/mailbox/bounces', search: '' })).not.toBe('inbox')
    expect(resolveMailboxSection({ pathname: '/admin/mailbox/dmarc', search: '' })).not.toBe('inbox')
  })

  it('still understands the old query URLs, so bookmarks keep working', () => {
    // These used to be the ONLY way to reach machine mail, and were the source
    // of the double highlight. They now resolve to the same section their
    // dedicated route does — one entry lit, and it is not Inbox.
    expect(resolveMailboxSection({ pathname: '/admin/mailbox/inbox', search: '?mailbox=bounce' })).toBe('bounces')
    expect(resolveMailboxSection({ pathname: '/admin/mailbox/inbox', search: '?mailbox=dmarc' })).toBe('dmarc')
  })

  it('treats plain Inbox as Inbox, with no machine folder active', () => {
    const active = resolveMailboxSection({ pathname: '/admin/mailbox/inbox', search: '' })
    expect(active).toBe('inbox')
    expect(active).not.toBe('bounces')
    expect(active).not.toBe('dmarc')
  })

  it('accepts a URLSearchParams as well as a string', () => {
    expect(
      resolveMailboxSection({ pathname: '/admin/mailbox/inbox', search: new URLSearchParams('mailbox=bounce') }),
    ).toBe('bounces')
  })

  it('falls back to the Inbox for a bare or unknown path', () => {
    // A stale bookmark should land somewhere real rather than on a blank
    // screen with nothing selected.
    expect(resolveMailboxSection({ pathname: '/admin/mailbox', search: '' })).toBe('inbox')
    expect(resolveMailboxSection({ pathname: '/admin/mailbox/does-not-exist', search: '' })).toBe('inbox')
  })
})

describe('the section catalogue', () => {
  it('has a unique key per section', () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTION_KEYS.length)
  })

  it('resolves every key back to a section that knows its kind', () => {
    for (const key of SECTION_KEYS) {
      const section = sectionFor(key)
      expect(section.key).toBe(key)
      expect(['threads', 'messages', 'diagnostics']).toContain(section.kind)
    }
  })

  it('keeps Outbox and Sent as separate sections', () => {
    // Collapsing them would report a queued reply as delivered.
    const keys = FOLDERS.map((folder) => folder.key)
    expect(keys).toContain('outbox')
    expect(keys).toContain('sent')
  })
})
