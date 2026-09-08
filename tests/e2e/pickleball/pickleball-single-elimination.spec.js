import { test, expect } from '@playwright/test'

// C2: SINGLE_ELIMINATION brackets end-to-end.
//
// Deliberately a separate spec file rather than more cases in
// pickleball-tournaments.spec.js. That file already runs long enough that a
// single `wrangler dev --local` server dies partway through it, and the
// failure presents as a wall of ECONNREFUSED rather than as anything to do
// with the tests -- adding another dozen bracket cases to it would make that
// worse for everybody. Helpers are local copies for the same reason that
// file's own header gives for duplicating them: they are module-local there,
// not exported.

async function createEliminationSession(request, courtCount) {
  await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const venueResponse = await request.post('/api/pickleball/venues', { data: { name: `Bracket Venue ${unique}` } })
  expect(venueResponse.ok()).toBe(true)
  const venueId = (await venueResponse.json()).venue.id

  for (let i = 0; i < courtCount; i += 1) {
    expect((await request.post('/api/pickleball/courts', { data: { venueId, name: `Court ${i + 1}` } })).ok()).toBe(true)
  }

  const sessionResponse = await request.post('/api/pickleball/sessions', {
    data: {
      venueId,
      name: `Bracket Session ${unique}`,
      sessionType: 'FIXED_PAIRS',
      scoringRulesetId: 'usap-2026-sideout-11-doubles',
      scheduledStart: '2026-09-08T18:00:00.000Z',
      scheduledEnd: '2026-09-08T22:00:00.000Z',
      tournamentFormat: 'SINGLE_ELIMINATION',
    },
  })
  expect(sessionResponse.status()).toBe(201)
  return (await sessionResponse.json()).session.id
}

// A live SINGLE_ELIMINATION session with `pairCount` formed and ENTERED
// pairs, plus `courtCount` courts.
async function createLiveBracket(request, pairCount, courtCount = 1) {
  const sessionId = await createEliminationSession(request, courtCount)
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'OPEN_FOR_CHECKIN' } })
  await request.post(`/api/pickleball/sessions/${sessionId}/status`, { data: { status: 'LIVE' } })

  const sessionCourts = courtCount
    ? (await (await request.get(`/api/pickleball/sessions/${sessionId}/courts`)).json()).courts
    : []

  const pairs = []
  for (let i = 0; i < pairCount; i += 1) {
    const sessionPlayerIds = []
    for (let member = 0; member < 2; member += 1) {
      const playerResponse = await request.post('/api/pickleball/players', {
        data: { displayName: `Bracket Player ${Date.now()}-${i}-${member}-${Math.random().toString(36).slice(2)}` },
      })
      const playerId = (await playerResponse.json()).player.id
      const registerResponse = await request.post(`/api/pickleball/sessions/${sessionId}/players`, { data: { playerId } })
      sessionPlayerIds.push((await registerResponse.json()).sessionPlayer.id)
      await request.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { data: { playerId } })
    }

    const pairResponse = await request.post(`/api/pickleball/sessions/${sessionId}/pairs`, {
      data: { sessionPlayerAId: sessionPlayerIds[0], sessionPlayerBId: sessionPlayerIds[1] },
    })
    expect(pairResponse.status()).toBe(201)
    const pair = (await pairResponse.json()).pair
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/tournament/entrants`, { data: { sessionPairId: pair.id } })).status()).toBe(201)
    pairs.push(pair)
  }

  return { sessionId, sessionCourts, pairs }
}

const lockBracket = (request, sessionId) => request.post(`/api/pickleball/sessions/${sessionId}/tournament/lock`, { data: {} })
const assignCourt = (request, sessionId, sessionCourtId) =>
  request.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { data: { sessionCourtId } })

async function getFixtures(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/fixtures`)
  expect(response.status()).toBe(200)
  return (await response.json()).fixtures
}

async function getEntrants(request, sessionId) {
  const response = await request.get(`/api/pickleball/sessions/${sessionId}/tournament/entrants`)
  expect(response.status()).toBe(200)
  return (await response.json()).entrants
}

// Plays whichever fixture assignCourt proposes on `sessionCourtId` through to
// a real 11-0 finish, and returns the fixture it turned out to be along with
// the winning entrant. The caller does not choose the winner: with a bracket,
// who is seated is decided by the fixture list, so the test follows it rather
// than trying to steer it.
async function playProposedFixture(request, sessionId, sessionCourtId) {
  const assignResponse = await assignCourt(request, sessionId, sessionCourtId)
  expect(assignResponse.status()).toBe(200)
  const assignBody = await assignResponse.json()

  const startResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
    data: {
      sessionCourtId,
      servingTeam: 'A',
      teamAStartingServerSessionPlayerId: assignBody.teamA.players[0].sessionPlayerId,
      teamBStartingServerSessionPlayerId: assignBody.teamB.players[0].sessionPlayerId,
    },
  })
  expect(startResponse.status()).toBe(201)
  const gameId = (await startResponse.json()).game.id

  const fixtureNow = (await getFixtures(request, sessionId)).find((f) => f.gameId === gameId)
  expect(fixtureNow).toBeTruthy()
  expect(fixtureNow.status).toBe('IN_PROGRESS')

  for (let i = 0; i < 11; i += 1) {
    const rallyResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, {
      data: { winningTeam: 'A' },
    })
    expect(rallyResponse.status()).toBe(200)
  }
  expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/finish`, { data: {} })).status()).toBe(200)

  const finished = (await getFixtures(request, sessionId)).find((f) => f.id === fixtureNow.id)
  expect(finished.status).toBe('FINISHED')
  return { fixture: finished, gameId, winnerEntrantId: finished.winnerEntrantId }
}

test.describe('Pickleball single elimination: bracket shape', () => {
  test('a 4-entrant bracket locks to 3 fixtures: two READY semi-finals and a PENDING final wired to both', async ({ request }) => {
    const { sessionId } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    expect(fixtures).toHaveLength(3)

    const semis = fixtures.filter((f) => f.roundNumber === 1)
    const finals = fixtures.filter((f) => f.roundNumber === 2)
    expect(semis).toHaveLength(2)
    expect(finals).toHaveLength(1)

    // Both semis are immediately playable; the final is not, and knows where
    // its two entrants will come from.
    expect(semis.every((f) => f.status === 'READY' && f.entrantAId && f.entrantBId)).toBe(true)
    const final = finals[0]
    expect(final.status).toBe('PENDING')
    expect(final.entrantAId).toBeFalsy()
    expect(final.entrantBId).toBeFalsy()
    expect([final.sourceA, final.sourceB].sort()).toEqual([`WINNER_OF:${semis[0].id}`, `WINNER_OF:${semis[1].id}`].sort())
  })

  test('sources are rewritten to real fixture ids, never left as generator slot keys', async ({ request }) => {
    const { sessionId } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    const ids = new Set(fixtures.map((f) => f.id))
    const sources = fixtures.flatMap((f) => [f.sourceA, f.sourceB]).filter(Boolean)

    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      const target = source.replace('WINNER_OF:', '')
      // A surviving slot key would look like 'MAIN:1:0' and match no id.
      expect(target).not.toMatch(/^MAIN:/)
      expect(ids.has(target)).toBe(true)
    }
  })

  test('a 3-entrant bracket gives the top seed a bye: 2 fixtures, and the bye sits pre-filled in the final', async ({ request }) => {
    const { sessionId } = await createLiveBracket(request, 3, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    // n-1, not bracketSize-1: the bye is advanced, never listed as a match an
    // operator could try to start.
    expect(fixtures).toHaveLength(2)
    expect(fixtures.some((f) => f.status === 'BYE')).toBe(false)

    const final = fixtures.find((f) => f.roundNumber === 2)
    const semi = fixtures.find((f) => f.roundNumber === 1)

    // Exactly one side of the final is already occupied (the bye), the other
    // waits on the single semi-final.
    const filledSides = [final.entrantAId, final.entrantBId].filter(Boolean)
    expect(filledSides).toHaveLength(1)
    expect(final.status).toBe('PENDING')
    expect([final.sourceA, final.sourceB].filter(Boolean)).toEqual([`WINNER_OF:${semi.id}`])

    // And the entrant with the bye is the TOP seed, not an arbitrary one.
    const entrants = await getEntrants(request, sessionId)
    const topSeed = entrants.reduce((best, e) => (best === null || e.seed < best.seed ? e : best), null)
    expect(filledSides[0]).toBe(topSeed.id)
  })
})

test.describe('Pickleball single elimination: advancement', () => {
  test('winning a semi-final carries the winner into the final, which becomes READY only once BOTH semis are done', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const firstSemi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect(firstSemi.winnerEntrantId).toBeTruthy()

    // One side filled, one side still waiting -- the final must NOT be
    // offerable yet, or assignCourt would seat a match with an empty chair.
    const afterFirst = await getFixtures(request, sessionId)
    const finalAfterFirst = afterFirst.find((f) => f.roundNumber === 2)
    expect(finalAfterFirst.status).toBe('PENDING')
    expect([finalAfterFirst.entrantAId, finalAfterFirst.entrantBId].filter(Boolean)).toEqual([firstSemi.winnerEntrantId])

    const secondSemi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect(secondSemi.fixture.id).not.toBe(firstSemi.fixture.id)

    const afterBoth = await getFixtures(request, sessionId)
    const finalAfterBoth = afterBoth.find((f) => f.roundNumber === 2)
    expect(finalAfterBoth.status).toBe('READY')
    expect([finalAfterBoth.entrantAId, finalAfterBoth.entrantBId].sort()).toEqual(
      [firstSemi.winnerEntrantId, secondSemi.winnerEntrantId].sort(),
    )
    // The two LOSERS are gone from the bracket entirely -- nothing else is
    // left to play.
    expect(afterBoth.filter((f) => f.status === 'READY')).toHaveLength(1)
  })

  test('a 4-entrant bracket plays to completion in exactly 3 games and crowns one champion', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const played = []
    for (let i = 0; i < 3; i += 1) {
      played.push(await playProposedFixture(request, sessionId, sessionCourts[0].id))
    }

    const fixtures = await getFixtures(request, sessionId)
    expect(fixtures.every((f) => f.status === 'FINISHED')).toBe(true)

    // Nothing left to assign: the bracket is genuinely exhausted, not merely
    // out of free courts.
    const exhausted = await assignCourt(request, sessionId, sessionCourts[0].id)
    expect(exhausted.status()).toBe(409)

    const champion = fixtures.find((f) => f.roundNumber === 2).winnerEntrantId
    expect(champion).toBe(played[2].winnerEntrantId)

    // The champion won both of their matches; each of the three others lost
    // exactly once and never appears as a winner.
    const winners = fixtures.map((f) => f.winnerEntrantId)
    expect(winners.filter((id) => id === champion)).toHaveLength(2)
  })

  test('the bye entrant reaches the final without playing, and the bracket completes in 2 games', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 3, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const beforePlay = await getFixtures(request, sessionId)
    const byeEntrantId = [beforePlay.find((f) => f.roundNumber === 2).entrantAId, beforePlay.find((f) => f.roundNumber === 2).entrantBId].find(Boolean)

    const semi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    const afterSemi = await getFixtures(request, sessionId)
    const final = afterSemi.find((f) => f.roundNumber === 2)
    expect(final.status).toBe('READY')
    expect([final.entrantAId, final.entrantBId].sort()).toEqual([byeEntrantId, semi.winnerEntrantId].sort())

    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect((await getFixtures(request, sessionId)).every((f) => f.status === 'FINISHED')).toBe(true)
  })
})

test.describe('Pickleball single elimination: correcting a result (un-advance)', () => {
  test('reopening a semi-final takes its winner back out of the final, which returns to PENDING', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const semi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    const finalBefore = (await getFixtures(request, sessionId)).find((f) => f.roundNumber === 2)
    expect([finalBefore.entrantAId, finalBefore.entrantBId].filter(Boolean)).toEqual([semi.winnerEntrantId])

    const reopenResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${semi.gameId}/reopen`, { data: {} })
    expect(reopenResponse.status()).toBe(200)

    const finalAfter = (await getFixtures(request, sessionId)).find((f) => f.roundNumber === 2)
    expect(finalAfter.entrantAId).toBeFalsy()
    expect(finalAfter.entrantBId).toBeFalsy()
    expect(finalAfter.status).toBe('PENDING')

    // The semi keeps its game link, so the re-finish can find it again --
    // clearing that would strand the fixture as a finished result nothing
    // ever updates.
    const semiAfter = (await getFixtures(request, sessionId)).find((f) => f.id === semi.fixture.id)
    expect(semiAfter.gameId).toBe(semi.gameId)
  })

  test('re-finishing a reopened semi-final puts the winner back into the final', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const semi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${semi.gameId}/reopen`, { data: {} })).status()).toBe(200)
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${semi.gameId}/finish`, { data: {} })).status()).toBe(200)

    const final = (await getFixtures(request, sessionId)).find((f) => f.roundNumber === 2)
    expect([final.entrantAId, final.entrantBId].filter(Boolean)).toEqual([semi.winnerEntrantId])
    expect(final.status).toBe('PENDING')
  })

  test('reopening a semi-final is REFUSED once the final has been played, and the refusal names the blocking match', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const firstSemi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    await playProposedFixture(request, sessionId, sessionCourts[0].id)

    const reopenResponse = await request.post(`/api/pickleball/sessions/${sessionId}/games/${firstSemi.gameId}/reopen`, { data: {} })
    expect(reopenResponse.status()).toBe(409)
    const error = (await reopenResponse.json()).error
    expect(error).toContain('already played their next match')
    expect(error).toContain('round 2, match 1')

    // Refused means nothing moved: the final still stands, with its result
    // and both entrants intact.
    const final = (await getFixtures(request, sessionId)).find((f) => f.roundNumber === 2)
    expect(final.status).toBe('FINISHED')
    expect(final.winnerEntrantId).toBeTruthy()
    expect(final.entrantAId).toBeTruthy()
    expect(final.entrantBId).toBeTruthy()
  })

  // A winner who WITHDREW while their game was reopened must not be marched
  // into the next round by the re-finish. This is reachable rather than
  // hypothetical: reopening leaves the fixture FINISHED, so the entrant holds
  // no open fixture and the withdrawal is accepted.
  test('re-finishing a reopened game does NOT promote a winner who has withdrawn in the meantime', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const semi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${semi.gameId}/reopen`, { data: {} })).status()).toBe(200)

    // Withdrawal is allowed here precisely because the fixture reads FINISHED.
    const withdrawResponse = await request.post(
      `/api/pickleball/sessions/${sessionId}/tournament/entrants/${semi.winnerEntrantId}/withdraw`,
      { data: {} },
    )
    expect(withdrawResponse.status()).toBe(200)

    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${semi.gameId}/finish`, { data: {} })).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    const final = fixtures.find((f) => f.roundNumber === 2)
    // The withdrawn winner is NOT sitting in the final.
    expect(final.entrantAId).not.toBe(semi.winnerEntrantId)
    expect(final.entrantBId).not.toBe(semi.winnerEntrantId)

    // Their side is vacated instead, so whoever wins the other semi takes the
    // final by walkover and the bracket still completes.
    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    const done = await getFixtures(request, sessionId)
    expect(done.every((f) => f.status === 'FINISHED')).toBe(true)
    expect(done.find((f) => f.roundNumber === 2).winnerEntrantId).toBeTruthy()
  })

  test('reopening the FINAL itself is allowed — nothing downstream depends on it', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    const final = await playProposedFixture(request, sessionId, sessionCourts[0].id)

    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${final.gameId}/reopen`, { data: {} })).status()).toBe(200)
  })
})

test.describe('Pickleball single elimination: operator UI', () => {
  test('the bracket renders unfilled later-round slots as TBD rather than blank, and fills them in as rounds are played', async ({
    page,
    request,
    context,
  }) => {
    const baseURL = test.info().project.use.baseURL
    const { loginAsOperator } = await import('./helpers.js')
    await loginAsOperator(request, context, baseURL)

    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    await page.goto(`/pickleball/app/sessions/${sessionId}/tournament`)
    await expect(page.getByTestId('tournament-fixtures')).toContainText('Round 2', { timeout: 10000 })

    // Round 2 exists before anyone has qualified for it -- the whole bracket
    // is generated up front -- so both of the final's slots must read TBD. A
    // blank would look like a rendering bug to an operator.
    await expect(page.getByTestId('tournament-fixtures')).toContainText('TBD vs TBD')

    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    await page.reload()
    await expect(page.getByTestId('tournament-fixtures')).toContainText('Round 2', { timeout: 10000 })

    // One semi played: exactly one side of the final is now a real name, so a
    // lone TBD remains and the both-sides-unknown text is gone.
    await expect(page.getByTestId('tournament-fixtures')).toContainText('TBD')
    await expect(page.getByTestId('tournament-fixtures')).not.toContainText('TBD vs TBD')
  })
})

test.describe('Pickleball single elimination: withdrawal', () => {
  test('withdrawing an entrant hands their opponent a walkover AND advances that opponent, so the bracket still completes', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const fixtures = await getFixtures(request, sessionId)
    const semiToForfeit = fixtures.filter((f) => f.roundNumber === 1)[0]
    const withdrawingId = semiToForfeit.entrantAId
    const survivorId = semiToForfeit.entrantBId

    const withdrawResponse = await request.post(
      `/api/pickleball/sessions/${sessionId}/tournament/entrants/${withdrawingId}/withdraw`,
      { data: {} },
    )
    expect(withdrawResponse.status()).toBe(200)

    const afterWithdraw = await getFixtures(request, sessionId)
    const forfeited = afterWithdraw.find((f) => f.id === semiToForfeit.id)
    expect(forfeited.status).toBe('FINISHED')
    expect(forfeited.winnerEntrantId).toBe(survivorId)
    expect(forfeited.gameId).toBeFalsy()

    // The promotion is the part that matters: without it the final would sit
    // PENDING forever with an empty slot and no command that fills it.
    const final = afterWithdraw.find((f) => f.roundNumber === 2)
    expect([final.entrantAId, final.entrantBId].filter(Boolean)).toEqual([survivorId])

    // The bracket still finishes: play the other semi, then the final.
    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    const readyFinal = (await getFixtures(request, sessionId)).find((f) => f.roundNumber === 2)
    expect(readyFinal.status).toBe('READY')

    await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect((await getFixtures(request, sessionId)).every((f) => f.status === 'FINISHED')).toBe(true)
  })

  // Review finding. The test above withdraws from a READY fixture -- both
  // sides already known -- which is the easy case. An entrant with a BYE sits
  // instead in a fixture that is still PENDING, because the side facing them
  // waits on a match nobody has played yet.
  //
  // Closing that fixture on withdrawal (the original behaviour) looked
  // reasonable and was badly wrong: it went FINISHED with no winner, and when
  // the feeding match was later played, the promotion that should have seated
  // its winner matched zero rows -- the slot was no longer PENDING or READY.
  // A pair who had genuinely won their match disappeared from the bracket,
  // with nothing reported anywhere.
  test('withdrawing a bye entrant waiting in a PENDING fixture still lets the eventual qualifier win it by walkover', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 3, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const beforeFixtures = await getFixtures(request, sessionId)
    const finalBefore = beforeFixtures.find((f) => f.roundNumber === 2)
    const semi = beforeFixtures.find((f) => f.roundNumber === 1)
    const byeEntrantId = [finalBefore.entrantAId, finalBefore.entrantBId].find(Boolean)

    // The precondition that makes this the hard case, not the easy one.
    expect(finalBefore.status).toBe('PENDING')
    expect(semi.status).toBe('READY')

    expect(
      (await request.post(`/api/pickleball/sessions/${sessionId}/tournament/entrants/${byeEntrantId}/withdraw`, { data: {} })).status(),
    ).toBe(200)

    // The final must NOT have been closed: the semi has not been played, so
    // who reaches it is still genuinely undecided.
    const afterWithdraw = await getFixtures(request, sessionId)
    const finalAfterWithdraw = afterWithdraw.find((f) => f.id === finalBefore.id)
    expect(finalAfterWithdraw.status).toBe('PENDING')
    expect(finalAfterWithdraw.winnerEntrantId).toBeFalsy()
    // The withdrawn side is emptied of entrant AND source, so nothing can ever
    // arrive there -- which is what later makes it a walkover rather than a
    // match still waiting on someone.
    expect(finalAfterWithdraw.entrantAId).toBeFalsy()
    expect(finalAfterWithdraw.sourceA).toBeFalsy()

    // Now play the semi: its winner must become champion by walkover, not
    // vanish from the bracket.
    const played = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect(played.winnerEntrantId).toBeTruthy()

    const finalFixtures = await getFixtures(request, sessionId)
    const finalAfterPlay = finalFixtures.find((f) => f.id === finalBefore.id)
    expect(finalAfterPlay.status).toBe('FINISHED')
    expect(finalAfterPlay.winnerEntrantId).toBe(played.winnerEntrantId)
    expect(finalAfterPlay.gameId).toBeFalsy()

    expect(finalFixtures.every((f) => f.status === 'FINISHED')).toBe(true)
    expect((await assignCourt(request, sessionId, sessionCourts[0].id)).status()).toBe(409)
  })
})

test.describe('Pickleball single elimination: abandoning a reopened game', () => {
  // Review finding. reopenGame deliberately leaves the fixture FINISHED (it
  // keeps game_id so the re-finish can find it again) while emptying the
  // downstream slot. abandonGame's fixture reset was scoped to
  // `status = 'IN_PROGRESS'`, so for a REOPENED game it matched zero rows: the
  // game went ABANDONED while the fixture stayed FINISHED with a stale winner
  // and a pointer to the abandoned game, and the slot reopen had already
  // emptied was never refilled. The bracket was stuck below that fixture for
  // good, and abandonGame returned ok.
  test('abandoning a reopened semi-final returns its fixture to READY so the bracket can still be completed', async ({ request }) => {
    const { sessionId, sessionCourts } = await createLiveBracket(request, 4, 1)
    expect((await lockBracket(request, sessionId)).status()).toBe(200)

    const semi = await playProposedFixture(request, sessionId, sessionCourts[0].id)
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${semi.gameId}/reopen`, { data: {} })).status()).toBe(200)
    expect((await request.post(`/api/pickleball/sessions/${sessionId}/games/${semi.gameId}/abandon`, { data: {} })).status()).toBe(200)

    const afterAbandon = await getFixtures(request, sessionId)
    const semiAfter = afterAbandon.find((f) => f.id === semi.fixture.id)
    // Replayable, and carrying no result from the game that was thrown away.
    expect(semiAfter.status).toBe('READY')
    expect(semiAfter.gameId).toBeFalsy()
    expect(semiAfter.winnerEntrantId).toBeFalsy()

    // The final is still waiting for both sides, with nothing stale in it.
    const finalAfter = afterAbandon.find((f) => f.roundNumber === 2)
    expect(finalAfter.status).toBe('PENDING')
    expect([finalAfter.entrantAId, finalAfter.entrantBId].filter(Boolean)).toEqual([])

    // And the tournament genuinely still completes: replay the semi, then the
    // other semi, then the final.
    for (let i = 0; i < 3; i += 1) {
      await playProposedFixture(request, sessionId, sessionCourts[0].id)
    }
    expect((await getFixtures(request, sessionId)).every((f) => f.status === 'FINISHED')).toBe(true)
  })
})
