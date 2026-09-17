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
    // Lets a form attach the message to the input the server rejected,
    // instead of only showing a page-level banner.
    error.field = data?.field
    throw error
  }

  return data
}

export const adminApi = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
