export type OrgRole = 'ADMIN' | 'SESSION_FACILITATOR' | 'SCOREKEEPER'

export interface OrgQuotas {
  maxAdmins: number | null
  maxFacilitators: number | null
  maxScorekeepers: number | null
}

const CAP_FIELD_BY_ROLE: Record<OrgRole, keyof OrgQuotas> = {
  ADMIN: 'maxAdmins',
  SESSION_FACILITATOR: 'maxFacilitators',
  SCOREKEEPER: 'maxScorekeepers',
}

export function canAddOperator(org: OrgQuotas, role: OrgRole, currentActiveCount: number): boolean {
  const cap = org[CAP_FIELD_BY_ROLE[role]]
  if (cap === null || cap === undefined) return true
  return currentActiveCount < cap
}
