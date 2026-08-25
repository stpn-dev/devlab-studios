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
