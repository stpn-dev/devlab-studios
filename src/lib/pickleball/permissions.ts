export type Role = 'ADMIN' | 'SESSION_FACILITATOR' | 'SCOREKEEPER'

export type Permission =
  | 'MANAGE_VENUES_COURTS'
  | 'MANAGE_OPERATORS'
  | 'MANAGE_SESSIONS'
  | 'MANAGE_PLAYERS'
  | 'CHECK_IN_PLAYERS'
  | 'MANAGE_QUEUE'
  | 'ASSIGN_COURT'
  | 'SCORE_GAME'
  | 'FINISH_GAME'
  | 'UNDO_SCORE_EVENT'
  | 'REOPEN_GAME'
  | 'CORRECT_GAME'
  | 'VIEW_AUDIT_LOG'
  | 'CONFIGURE_SYSTEM_DEFAULTS'

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set<Permission>([
    'MANAGE_VENUES_COURTS',
    'MANAGE_OPERATORS',
    'MANAGE_SESSIONS',
    'MANAGE_PLAYERS',
    'CHECK_IN_PLAYERS',
    'MANAGE_QUEUE',
    'ASSIGN_COURT',
    'SCORE_GAME',
    'FINISH_GAME',
    'UNDO_SCORE_EVENT',
    'REOPEN_GAME',
    'CORRECT_GAME',
    'VIEW_AUDIT_LOG',
    'CONFIGURE_SYSTEM_DEFAULTS',
  ]),
  SESSION_FACILITATOR: new Set<Permission>([
    'MANAGE_VENUES_COURTS',
    'MANAGE_SESSIONS',
    'MANAGE_PLAYERS',
    'CHECK_IN_PLAYERS',
    'MANAGE_QUEUE',
    'ASSIGN_COURT',
    'SCORE_GAME',
    'FINISH_GAME',
    'UNDO_SCORE_EVENT',
    'REOPEN_GAME',
    'CORRECT_GAME',
  ]),
  SCOREKEEPER: new Set<Permission>(['SCORE_GAME', 'FINISH_GAME', 'UNDO_SCORE_EVENT']),
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

export interface PermissionSession {
  role: Role | null
  isPlatformAdmin: boolean
}

export function hasPermission(session: PermissionSession, permission: Permission): boolean {
  if (session.isPlatformAdmin) return true
  if (!session.role) return false
  return can(session.role, permission)
}
