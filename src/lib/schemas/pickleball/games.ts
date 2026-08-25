import { z } from 'zod'

// Both starting-server fields are required even for SINGLES (where each team
// has exactly one member) -- the DO layer validates each supplied id actually
// IS a member of its labeled team (and, for SINGLES, the sole member): for
// DOUBLES it validates the supplied id is ONE of that team's two members, not
// necessarily "the first" in any stored order, since there's no meaningful
// ordering to violate -- the facilitator is explicitly choosing who serves
// first, and which team is "team A" is itself derived from this choice (see
// SessionCoordinatorDO.startGame).
export const startGameSchema = z.object({
  sessionCourtId: z.string().uuid(),
  servingTeam: z.enum(['A', 'B']),
  teamAStartingServerSessionPlayerId: z.string().uuid(),
  teamBStartingServerSessionPlayerId: z.string().uuid(),
})

const idempotencyKeySchema = z.string().min(1).max(100).optional()

export const rallySchema = z.object({
  winningTeam: z.enum(['A', 'B']),
  idempotencyKey: idempotencyKeySchema,
})

export const finishGameSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
})

export const abandonGameSchema = z.object({}).strict()

export const reopenGameSchema = z.object({}).strict()

export const correctGameSchema = z.object({
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  servingTeam: z.enum(['A', 'B']),
  serverNumber: z.union([z.literal(1), z.literal(2)]),
})

export const grantOperatorSchema = z.object({
  userId: z.string().uuid(),
})

export const revokeOperatorSchema = z.object({
  userId: z.string().uuid(),
})
