import { describe, it, expect } from 'vitest'
import { buildInviteEmail } from './inviteEmail.js'

const BASE = {
  organizationName: 'Cebu Pickleball Club',
  role: 'SESSION_FACILITATOR',
  signInUrl: 'https://www.devlabstudios.com/pickleball/app',
}

describe('buildInviteEmail', () => {
  it('renders the database role name in a form a human would say out loud', () => {
    const { html, text } = buildInviteEmail(BASE)
    expect(text).toContain('Your role: Session Facilitator')
    expect(html).toContain('Session Facilitator')
    expect(html).not.toContain('SESSION_FACILITATOR')
  })

  it('names the inviter when known, and stays grammatical when not', () => {
    const withName = buildInviteEmail({ ...BASE, invitedByName: 'Stephen Agustinez' })
    expect(withName.text).toContain('Stephen Agustinez has added you to Cebu Pickleball Club')

    const without = buildInviteEmail(BASE)
    expect(without.text).toContain('You have been added to Cebu Pickleball Club')
    expect(without.text).not.toContain('undefined')
    expect(without.text).not.toContain('null')
  })

  it('does not claim an existing member was just added', () => {
    const { subject, text, html } = buildInviteEmail({ ...BASE, role: 'ADMIN', isRoleChange: true })
    expect(subject).toBe('Your role at Cebu Pickleball Club has changed')
    expect(text).toContain('updated your role')
    expect(html).toContain('Your role at Cebu Pickleball Club has changed')
    expect(text).not.toContain('has added you')
  })

  // The organization name is typed by an operator and lands inside HTML that
  // is delivered to someone else's inbox. Escaping it is the whole defence.
  it('escapes an organization name that contains markup', () => {
    const { html } = buildInviteEmail({
      ...BASE,
      organizationName: '<script>alert("xss")</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes an inviter name that contains markup', () => {
    const { html } = buildInviteEmail({ ...BASE, invitedByName: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('falls back to readable copy when the organization and role are missing', () => {
    const { subject, text, html } = buildInviteEmail({ ...BASE, organizationName: '', role: '' })
    expect(subject).toContain('a pickleball club')
    expect(text).toContain('Your role: Operator')
    expect(html).not.toContain('undefined')
  })

  it('puts the sign-in link in the button, the visible fallback, and the plain text', () => {
    const { text, html } = buildInviteEmail(BASE)
    expect(text).toContain(BASE.signInUrl)
    // Once as the button href, once as the copy-paste anchor's href, and once
    // as that anchor's visible text -- a client that strips the button still
    // shows a usable link.
    expect(html.split(BASE.signInUrl).length - 1).toBe(3)
  })
})
