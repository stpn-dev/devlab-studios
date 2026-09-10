// The operator invite email.
//
// Email HTML is not web HTML. Outlook renders through Word, Gmail strips
// <style> blocks and anything it does not recognise, and flexbox/grid are
// unavailable in enough clients to be unusable. So this is a table layout with
// inline styles and no external CSS -- deliberately old-fashioned, because it
// is the only thing that renders the same everywhere.
//
// Every message also ships a plain-text alternative. Some clients prefer it,
// some people force it, and spam filters treat an HTML-only message as a
// signal. Resend takes both and lets the client choose.

const BRAND_INK = '#111321'
const BRAND_PURPLE = '#7600ff'
const MUTED = '#5b6478'
const BORDER = '#e4e7f2'

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// "SESSION_FACILITATOR" is how the database spells it; nobody should read that
// in an email.
function humaniseRole(role) {
  return String(role || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * The invite endpoint is an upsert: the same call that invites a new operator
 * also changes an existing one's role. `isRoleChange` keeps the copy honest,
 * because telling someone who has been in the club for a month that they have
 * "been added" to it is simply false.
 *
 * @param {{ organizationName: string, role: string, signInUrl: string, invitedByName?: string | null, isRoleChange?: boolean }} invite
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildInviteEmail({ organizationName, role, signInUrl, invitedByName, isRoleChange = false }) {
  const orgName = organizationName || 'a pickleball club'
  const roleLabel = humaniseRole(role) || 'Operator'
  const actor = invitedByName || null

  const headline = isRoleChange ? `Your role at ${orgName} has changed` : `You have been added to ${orgName}`
  const subject = isRoleChange
    ? `Your role at ${orgName} has changed`
    : `You have been added to ${orgName} on Devlab Pickleball`

  const opener = isRoleChange
    ? `${actor ? `${actor} has updated` : 'Someone has updated'} your role at ${orgName} on Devlab Pickleball.`
    : `${actor ? `${actor} has added you to` : 'You have been added to'} ${orgName} on Devlab Pickleball.`

  // Plain text first: it is the version that must always make sense on its
  // own, so the link is spelled out rather than hidden behind anchor text.
  const text = [
    opener,
    '',
    `Your role: ${roleLabel}`,
    '',
    'To get in, sign in with Google using THIS email address:',
    signInUrl,
    '',
    'There is no password and nothing to accept -- your access is already active,',
    'and signing in with the invited address is what connects it to your account.',
    '',
    'If you were not expecting this, you can ignore this message. Nothing happens',
    'until someone signs in.',
    '',
    'Devlab Pickleball · devlabstudios.com',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5fa;">
  <!-- Preheader: the grey line clients show next to the subject. Hidden in
       the body itself, so it does not read as a duplicate first sentence. -->
  <div style="display:none;font-size:1px;color:#f4f5fa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    You are now ${escapeHtml(roleLabel)} at ${escapeHtml(orgName)}. Sign in with Google using this address.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5fa;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:14px;">

          <tr>
            <td style="padding:32px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">Devlab Pickleball</p>
              <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;color:${BRAND_INK};">${escapeHtml(headline)}</h1>
              <div style="margin-top:14px;height:3px;width:44px;border-radius:999px;background-color:${BRAND_PURPLE};"></div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3c4356;">
              <p style="margin:0 0 14px 0;">${escapeHtml(opener)}</p>
              <p style="margin:0 0 14px 0;">Your role is <strong style="color:${BRAND_INK};">${escapeHtml(roleLabel)}</strong>.</p>
              <p style="margin:0;">Sign in with Google using <strong style="color:${BRAND_INK};">this email address</strong> — that is what links your access to your account. There is no password and nothing to accept.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 4px 32px;" align="left">
              <!-- Bulletproof-ish button: a padded table cell, because Outlook
                   ignores padding and border-radius on an <a>. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${BRAND_PURPLE}" style="border-radius:8px;">
                    <a href="${escapeHtml(signInUrl)}"
                       style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Sign in to Devlab Pickleball
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 22px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${MUTED};">
              <!-- Some clients strip the button, and some people simply do not
                   trust one. The URL is always here in full. -->
              <p style="margin:0;">Or paste this into your browser:<br>
                <a href="${escapeHtml(signInUrl)}" style="color:${BRAND_PURPLE};word-break:break-all;">${escapeHtml(signInUrl)}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 32px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid ${BORDER};">
              <p style="margin:0;">If you were not expecting this you can ignore it — nothing happens until someone signs in.</p>
              <p style="margin:10px 0 0 0;">Devlab Pickleball · <a href="https://www.devlabstudios.com/pickleball" style="color:${MUTED};">devlabstudios.com</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}

const DEFAULT_SENDER = 'hello@devlabstudios.com'

/**
 * Emails an invited operator their sign-in link.
 *
 * Returns a result rather than throwing, and the caller reports it to the
 * operator who sent the invite. That is the whole point of this function's
 * shape: the membership row is already committed by the time we get here, so
 * a failed send must not fail the request -- but it must not be silent
 * either. An invite that was created and never delivered looked exactly like
 * a delivered one in the UI, which is how "I invited someone but they never
 * got a mail" became impossible to diagnose from the outside.
 *
 * @param {{ PICKLEBALL_OAUTH_REDIRECT_BASE_URL?: string, RESEND_API_KEY?: string, RESEND_FROM_EMAIL?: string, PICKLEBALL_TEST_AUTH_ENABLED?: string }} env
 * @param {{ toEmail: string, organizationName: string, role: string, invitedByName?: string | null, isRoleChange?: boolean }} invite
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function sendInviteEmail(env, { toEmail, organizationName, role, invitedByName, isRoleChange = false }) {
  // An environment that accepts forged logins must not email real people.
  // This matters concretely: RESEND_API_KEY is present in .dev.vars, and the
  // e2e suite invites a dozen throwaway addresses per run -- without this the
  // test suite would mail every one of them and the resulting bounces would
  // degrade the sending reputation of the very domain these invites go out
  // from. Compared against the string 'true' exactly as test-login.ts does.
  if (env.PICKLEBALL_TEST_AUTH_ENABLED === 'true') {
    console.log(JSON.stringify({ event: 'invite_email', outcome: 'suppressed', reason: 'test_environment' }))
    return { ok: false, reason: 'test_environment' }
  }

  const baseUrl = env.PICKLEBALL_OAUTH_REDIRECT_BASE_URL
  if (!baseUrl) {
    console.log(JSON.stringify({ event: 'invite_email', outcome: 'skipped', reason: 'missing_base_url' }))
    return { ok: false, reason: 'missing_base_url' }
  }
  if (!env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: 'invite_email', outcome: 'skipped', reason: 'missing_api_key' }))
    return { ok: false, reason: 'missing_api_key' }
  }

  const fromEmail = env.RESEND_FROM_EMAIL || DEFAULT_SENDER
  // Environment-derived, so an invite sent from preview links to preview
  // rather than dropping the recipient onto production.
  const signInUrl = `${baseUrl}/pickleball/app`
  const { subject, text, html } = buildInviteEmail({ organizationName, role, signInUrl, invitedByName, isRoleChange })
  const startedAt = Date.now()

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Devlab Pickleball <${fromEmail}>`,
        to: [toEmail],
        subject,
        text,
        html,
      }),
    })

    const durationMs = Date.now() - startedAt
    const body = await response.json().catch(() => null)

    if (response.ok && body?.id) {
      console.log(JSON.stringify({ event: 'invite_email', outcome: 'success', durationMs, statusCode: response.status, resendId: body.id }))
      return { ok: true }
    }

    // The recipient address is deliberately absent from these logs -- an
    // invited email address is personal data and the delivery outcome is
    // diagnosable without it.
    const reason = body?.message || `Upstream returned ${response.status}`
    console.log(JSON.stringify({ event: 'invite_email', outcome: 'failure', durationMs, statusCode: response.status, reason }))
    return { ok: false, reason }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const reason = error instanceof Error ? error.message : 'Unknown error'
    console.log(JSON.stringify({ event: 'invite_email', outcome: 'failure', durationMs, reason }))
    return { ok: false, reason }
  }
}
