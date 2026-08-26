// Playwright's `request` and `page` fixtures do NOT share a cookie jar in
// this project's Playwright version -- confirmed by a diagnostic run where
// `page.request.get('/api/pickleball/auth/session')` came back 401 right
// after `request.post('/api/pickleball/auth/test-login', ...)` had already
// succeeded. The fallback is to pull the Set-Cookie header off the login
// response and hand it to `page.context().addCookies([...])` explicitly
// before the WebSocket ever opens in the page. Every spec that logs in via
// `request` and then opens a socket (or navigates) via `page` should reuse
// this same helper rather than re-implementing the cookie-bridging inline.
export async function loginAsOperator(request, context, baseURL) {
  const loginResponse = await request.post('/api/pickleball/auth/test-login', { data: { email: 'operator@example.com' } })
  const setCookie = loginResponse.headers()['set-cookie']
  const [nameValue] = setCookie.split(';')
  const separatorIndex = nameValue.indexOf('=')
  const name = nameValue.slice(0, separatorIndex)
  const value = nameValue.slice(separatorIndex + 1)
  await context.addCookies([{ name, value, url: baseURL }])
  return loginResponse
}
