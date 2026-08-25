import type { GameState } from './gameState'

export interface ServerIdentity {
  teamACurrentServerId: string
  teamBCurrentServerId: string
}

// Models the standard doubles server-rotation rule: each team's own two
// players swap which one currently holds the "serves first" position
// exactly when (a) that team is doubles and just went server1 -> server2
// (the partner takes over for this same service turn), or (b) that team
// just regained the serve via a side out (the player who did NOT serve last
// time that team had the serve now serves first this time). A team that is
// NOT currently affected by either transition keeps its stored identity
// unchanged, so rotation correctly continues from wherever that team left
// off the next time they regain serve, rather than resetting.
//
// Singles passes `null` for both "other player" arguments -- there is no
// second player to rotate to, so identity is always a no-op for singles.
export function nextServerIdentity(
  identity: ServerIdentity,
  before: GameState,
  after: GameState,
  teamAOtherPlayerId: string | null,
  teamBOtherPlayerId: string | null,
): ServerIdentity {
  const servingTeamChanged = before.servingTeam !== after.servingTeam
  const serverNumberChanged = before.serverNumber !== after.serverNumber

  if (!servingTeamChanged && !serverNumberChanged) {
    // POINT_AWARDED -- no rotation change.
    return identity
  }

  if (!servingTeamChanged && serverNumberChanged) {
    // SERVE_CHANGED (doubles only): the serving team's own player swaps.
    if (before.servingTeam === 'A') {
      return teamAOtherPlayerId ? { ...identity, teamACurrentServerId: teamAOtherPlayerId } : identity
    }
    return teamBOtherPlayerId ? { ...identity, teamBCurrentServerId: teamBOtherPlayerId } : identity
  }

  // SIDE_OUT: the team that just gained serve (after.servingTeam) rotates
  // its own player; the team that just lost serve is untouched.
  if (after.servingTeam === 'A') {
    return teamAOtherPlayerId ? { ...identity, teamACurrentServerId: teamAOtherPlayerId } : identity
  }
  return teamBOtherPlayerId ? { ...identity, teamBCurrentServerId: teamBOtherPlayerId } : identity
}

export function deriveServingPlayer(state: GameState, identity: ServerIdentity): string {
  return state.servingTeam === 'A' ? identity.teamACurrentServerId : identity.teamBCurrentServerId
}
