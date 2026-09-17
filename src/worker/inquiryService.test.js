import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { submitInquiry } from './inquiryService.js'

/**
 * Pipeline-level tests for the guarantee this whole feature exists for:
 * an inquiry is durably stored BEFORE any external call, so a failing email
 * provider can leave it undelivered but can never lose it.
 *
 * The D1 fake below recognizes statements by shape rather than parsing SQL.
 * That is enough to exercise ordering, idempotency, and failure handling —
 * the real schema is covered by the migration itself.
 */
function createDbFake({ failInsert = false, failBatch = false } = {}) {
  const tables = {
    leads: [],
    lead_attribution: [],
    lead_consents: [],
    lead_activities: [],
    delivery_attempts: [],
  }

  function runStatement(sql, args) {
    if (/^\s*INSERT INTO leads/i.test(sql)) {
      if (failInsert) throw new Error('D1_ERROR: no such table: leads')
      const [
        id, name, email, subject, message, source, createdAt, updatedAt, inquiryType, company, website, phone,
        currentWorkflow, desiredOutcome, currentTools, teamSize, timeline, budgetRange, volume, preferredContact,
        solutionInterest, roleTitle, employmentType, workArrangement, locationRequirement, jobPostingUrl,
        hiringTimeline, qualification, qualificationScore, qualificationReasonsJson, idempotencyKey,
      ] = args

      if (idempotencyKey && tables.leads.some((row) => row.idempotency_key === idempotencyKey)) {
        throw new Error('D1_ERROR: UNIQUE constraint failed: leads.idempotency_key')
      }

      tables.leads.push({
        id, name, email, subject, message, source, status: 'pending',
        created_at: createdAt, updated_at: updatedAt,
        inquiry_type: inquiryType, pipeline_status: 'new', company, website, phone,
        current_workflow: currentWorkflow, desired_outcome: desiredOutcome, current_tools: currentTools,
        team_size: teamSize, timeline, budget_range: budgetRange, volume, preferred_contact: preferredContact,
        solution_interest: solutionInterest, role_title: roleTitle, employment_type: employmentType,
        work_arrangement: workArrangement, location_requirement: locationRequirement,
        job_posting_url: jobPostingUrl, hiring_timeline: hiringTimeline,
        qualification, qualification_score: qualificationScore,
        qualification_reasons_json: qualificationReasonsJson,
        assigned_owner: null, internal_notes: null, archived_at: null,
        idempotency_key: idempotencyKey,
      })
      return
    }

    for (const table of ['lead_attribution', 'lead_consents', 'lead_activities', 'delivery_attempts']) {
      if (new RegExp(`^\\s*INSERT INTO ${table}`, 'i').test(sql)) {
        tables[table].push({ sql, args })
        return
      }
    }

    if (/^\s*UPDATE leads SET status/i.test(sql)) {
      const [status, updatedAt, id] = args
      const row = tables.leads.find((lead) => lead.id === id)
      if (row) Object.assign(row, { status, updated_at: updatedAt })
      return
    }

    throw new Error(`unhandled statement: ${sql.slice(0, 60)}`)
  }

  function firstStatement(sql, args) {
    if (/FROM leads\s+WHERE idempotency_key = \?/i.test(sql)) {
      return tables.leads.find((row) => row.idempotency_key === args[0]) || null
    }
    if (/FROM leads\s+WHERE email = \? AND message = \?/i.test(sql)) {
      return tables.leads.find((row) => row.email === args[0] && row.message === args[1]) || null
    }
    if (/FROM leads WHERE id = \?/i.test(sql)) {
      return tables.leads.find((row) => row.id === args[0]) || null
    }
    if (/COUNT\(\*\) as count FROM delivery_attempts/i.test(sql)) {
      return { count: tables.delivery_attempts.length }
    }
    return null
  }

  const db = {
    tables,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            run: async () => runStatement(sql, args),
            first: async () => firstStatement(sql, args),
            all: async () => ({ results: [] }),
          }
        },
      }
    },
    async batch(statements) {
      if (failBatch) throw new Error('D1_ERROR: batch failed')
      for (const statement of statements) await statement.run()
    },
  }

  return db
}

function baseInput(overrides = {}) {
  return {
    inquiryType: 'business_system',
    fullName: 'Dana Reyes',
    email: 'Dana@Acme.co',
    message: 'Inquiries land in a shared inbox and follow-up depends on someone remembering to check it.',
    company: 'Acme Co',
    website: 'acme.co',
    phone: '',
    currentWorkflow: '',
    desiredOutcome: 'Every inquiry gets an owner.',
    currentTools: '',
    teamSize: '',
    timeline: 'within_month',
    budgetRange: '',
    volume: '',
    preferredContact: 'email',
    solutionInterest: '',
    roleTitle: '',
    employmentType: '',
    workArrangement: '',
    locationRequirement: '',
    jobPostingUrl: '',
    hiringTimeline: '',
    attribution: { formId: 'business-inquiry-form', utmSource: 'newsletter' },
    consent: { granted: true, consentTextVersion: '2026-09-17', privacyPolicyVersion: '2026-09-17' },
    ...overrides,
  }
}

let fetchSpy

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
})

describe('submitInquiry — persistence guarantee', () => {
  it('returns 503 when the database binding is missing, without pretending it succeeded', async () => {
    const response = await submitInquiry({}, { input: baseInput(), source: 'form', consentType: 'contact' })
    expect(response.status).toBe(503)
  })

  it('persists the inquiry and reports persisted: true', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()

    const response = await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'business-inquiry-form',
      consentType: 'contact',
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.persisted).toBe(true)
    expect(db.tables.leads).toHaveLength(1)
  })

  it('normalizes the stored record', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'business-inquiry-form',
      consentType: 'contact',
    })

    const [lead] = db.tables.leads
    expect(lead.email).toBe('dana@acme.co')
    expect(lead.website).toBe('https://acme.co')
    expect(lead.source).toBe('business-inquiry-form')
  })

  it('records consent, attribution, and activity alongside the inquiry', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'business-inquiry-form',
      consentType: 'contact',
    })

    expect(db.tables.lead_consents).toHaveLength(1)
    expect(db.tables.lead_attribution).toHaveLength(1)
    // 'received' and 'qualified' at minimum.
    expect(db.tables.lead_activities.length).toBeGreaterThanOrEqual(2)
  })

  it('stores the qualification result and its reasons', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'form',
      consentType: 'contact',
    })

    const [lead] = db.tables.leads
    expect(['priority', 'standard', 'nurture', 'review']).toContain(lead.qualification)
    expect(JSON.parse(lead.qualification_reasons_json).length).toBeGreaterThan(0)
  })

  it('writes the lead BEFORE any outbound call is made', async () => {
    const db = createDbFake()
    let leadsAtFetchTime = -1
    fetchSpy.mockImplementation(async () => {
      leadsAtFetchTime = db.tables.leads.length
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 })
    })

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'form',
      consentType: 'contact',
    })

    expect(leadsAtFetchTime).toBe(1)
  })
})

describe('submitInquiry — external failures never lose a lead', () => {
  it('still reports success when the email provider returns 500', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: 'boom' }), { status: 500 }))
    const db = createDbFake()

    const response = await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'form',
      consentType: 'contact',
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.persisted).toBe(true)
    expect(db.tables.leads).toHaveLength(1)
    expect(db.tables.leads[0].status).toBe('failed')
    expect(db.tables.delivery_attempts.length).toBeGreaterThan(0)
  })

  it('still reports success when the network call throws outright', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNRESET'))
    const db = createDbFake()

    const response = await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'form',
      consentType: 'contact',
    })

    expect(response.status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
  })

  it('marks delivery failed and records the attempt when no provider is configured', async () => {
    const db = createDbFake()

    await submitInquiry({ DB: db }, { input: baseInput(), source: 'form', consentType: 'contact' })

    expect(db.tables.leads[0].status).toBe('failed')
    expect(db.tables.delivery_attempts).toHaveLength(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still persists the inquiry when the context batch write fails', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake({ failBatch: true })

    const response = await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'form',
      consentType: 'contact',
    })

    expect(response.status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
  })
})

describe('submitInquiry — database failure', () => {
  it('reports a 500 with a safe message and does NOT claim persistence', async () => {
    const db = createDbFake({ failInsert: true })

    const response = await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(),
      source: 'form',
      consentType: 'contact',
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.persisted).toBeUndefined()
    expect(body.code).toBe('persistence_failed')
    // The message must not leak the D1 error text.
    expect(body.error).not.toMatch(/D1_ERROR|no such table/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('submitInquiry — idempotency', () => {
  it('collapses an identical resubmission into the original record', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()
    const input = baseInput()

    const first = await (await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input, source: 'form', consentType: 'contact',
    })).json()
    const second = await (await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input, source: 'form', consentType: 'contact',
    })).json()

    expect(db.tables.leads).toHaveLength(1)
    expect(second.duplicate).toBe(true)
    expect(second.id).toBe(first.id)
  })

  it('does not send a second notification for a duplicate', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()
    const input = baseInput()

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, { input, source: 'form', consentType: 'contact' })
    const callsAfterFirst = fetchSpy.mock.calls.length
    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, { input, source: 'form', consentType: 'contact' })

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst)
  })

  it('treats a genuinely different message as a new inquiry', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput(), source: 'form', consentType: 'contact',
    })
    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput({ message: 'A completely different problem with the follow-up workflow entirely.' }),
      source: 'form',
      consentType: 'contact',
    })

    expect(db.tables.leads).toHaveLength(2)
  })

  it('still reports persisted: true for a duplicate, so the visitor sees success', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()
    const input = baseInput()

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, { input, source: 'form', consentType: 'contact' })
    const second = await (await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input, source: 'form', consentType: 'contact',
    })).json()

    expect(second.persisted).toBe(true)
    expect(second.ok).toBe(true)
  })
})

describe('submitInquiry — employment inquiries', () => {
  it('stores employment fields and leaves qualification unscored', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    const db = createDbFake()

    await submitInquiry({ DB: db, RESEND_API_KEY: 'test' }, {
      input: baseInput({
        inquiryType: 'employment_opportunity',
        roleTitle: 'Backend Engineer',
        employmentType: 'full_time',
        workArrangement: 'remote',
        timeline: '',
        desiredOutcome: '',
      }),
      source: 'employment-inquiry-form',
      consentType: 'contact',
    })

    const [lead] = db.tables.leads
    expect(lead.inquiry_type).toBe('employment_opportunity')
    expect(lead.role_title).toBe('Backend Engineer')
    expect(lead.qualification).toBe('unscored')
    expect(lead.qualification_score).toBe(0)
  })
})
