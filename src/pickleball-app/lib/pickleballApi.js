async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : null

  if (!response.ok) {
    const message = (data && data.error) || `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.issues = data?.issues
    throw error
  }

  return data
}

export const pickleballApi = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

// Turns a rejected request into something an operator can act on.
//
// The API already returns field-level detail for a 400 -- `{ error:
// 'Validation failed.', issues: [...] }` -- and the client already attaches it
// as `error.issues`. Every page then showed `error.message` alone, so a form
// with one bad field reported a bare "Validation failed." with no indication
// of WHICH field or why. That is indistinguishable from a broken app: the one
// case where the server knew exactly what was wrong was the case where the
// user was told least.
//
// Field names come back camelCase (`winBy`, `targetScore`), which is not what
// the label above the input says, so they are spaced and capitalised to match.
export function describeApiError(error) {
  const issues = error?.issues
  if (!Array.isArray(issues) || issues.length === 0) {
    return error?.message || 'Something went wrong.'
  }

  return issues
    .map((issue) => {
      const field = (issue.path || []).filter((part) => typeof part === 'string').join(' ')
      if (!field) return issue.message
      const label = field
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (character) => character.toUpperCase())
      return `${label}: ${issue.message}`
    })
    .join(' · ')
}
