// Pure decision logic for the org-invite accept flow, isolated from the
// D1-touching route handler (src/pages/api/pickleball/auth/org-invites/[token]/accept.ts)
// so it can be unit tested without a database. The route is responsible for
// mapping each outcome to the HTTP status/message it already returns today —
// not-found and already-used both map to the same 404 the route used before
// this logic was extracted (it never distinguished a missing token from a
// resolved one), expired maps to 410, wrong-email to 403.

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED'

export interface InviteRecordForValidation {
  status: InviteStatus | string
  invitedEmail: string
  expiresAt: string
}

export type InviteValidationResult =
  | { outcome: 'ok' }
  | { outcome: 'not-found' }
  | { outcome: 'already-used' }
  | { outcome: 'expired' }
  | { outcome: 'wrong-email' }

/**
 * Decides whether an invite can be accepted by the given (already
 * Google-authenticated) email, given the current time.
 *
 * @param invite The invite row looked up by token, or null if no row matched.
 * @param userEmail The authenticated caller's email.
 * @param now Defaults to the current time; pass an explicit Date in tests.
 */
export function validateInviteForAccept(
  invite: InviteRecordForValidation | null,
  userEmail: string,
  now: Date = new Date(),
): InviteValidationResult {
  if (!invite) return { outcome: 'not-found' }
  if (invite.status !== 'PENDING') return { outcome: 'already-used' }
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return { outcome: 'expired' }
  if (invite.invitedEmail.trim().toLowerCase() !== userEmail.trim().toLowerCase()) return { outcome: 'wrong-email' }
  return { outcome: 'ok' }
}
