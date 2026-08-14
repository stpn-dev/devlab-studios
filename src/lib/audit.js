const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|turnstile|message|bodyMarkdown)/i
const MAX_CHANGES = 40
const MAX_PREVIEW_LENGTH = 160

function preview(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[redacted]'
  if (value == null) return value
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`
  if (typeof value === 'object') return '{structured content}'
  const text = String(value)
  return text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH)}…` : text
}

function humanizePath(path) {
  return path
    .replace(/\[(\d+)\]/g, ' item $1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function walk(before, after, path, changes) {
  if (changes.length >= MAX_CHANGES || Object.is(before, after)) return

  const beforeIsObject = before && typeof before === 'object'
  const afterIsObject = after && typeof after === 'object'
  if (beforeIsObject && afterIsObject && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) walk(before[key], after[key], path ? `${path}.${key}` : key, changes)
    return
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({
        path,
        label: humanizePath(path),
        before: preview(before, path),
        after: preview(after, path),
      })
    }
    return
  }

  changes.push({
    path,
    label: humanizePath(path),
    before: preview(before, path),
    after: preview(after, path),
  })
}

export function entityDisplayName(value, fallback = 'content') {
  return String(value?.title || value?.name || value?.label || value?.slug || value?.id || fallback)
}

/** @param {{ before?: any, after?: any, label?: string, note?: string }} [options] */
export function buildAuditMetadata({ before = null, after = null, label = 'Content', note = '' } = {}) {
  const changes = []
  walk(before, after, '', changes)
  const visibleChanges = changes.filter((change) => change.path)
  const changedLabels = visibleChanges.slice(0, 3).map((change) => change.label)
  const overflow = Math.max(0, visibleChanges.length - changedLabels.length)
  const summary = note || (visibleChanges.length
    ? `Updated ${label}: ${changedLabels.join(', ')}${overflow ? ` and ${overflow} more` : ''}.`
    : `Saved ${label} with no field changes.`)

  return {
    summary,
    changedFields: visibleChanges,
    changeCount: visibleChanges.length,
    truncated: changes.length >= MAX_CHANGES,
  }
}

/** @param {any} value @param {string} label */
export function buildCreateAuditMetadata(value, label) {
  const name = entityDisplayName(value, label)
  return { summary: `Created ${label}: ${name}.`, name }
}

/** @param {any} value @param {string} label */
export function buildDeleteAuditMetadata(value, label) {
  const name = entityDisplayName(value, label)
  return { summary: `Deleted ${label}: ${name}.`, name }
}
