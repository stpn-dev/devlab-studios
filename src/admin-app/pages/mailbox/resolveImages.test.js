import { describe, expect, it } from 'vitest'
import { buildCidMap, hasDeferredRemoteImages, resolveMessageHtml } from './resolveImages.js'

const ID = '45c4218a-d098-479c-a51b-f5fefb8dcf64'
const OTHER_ID = '11111111-2222-3333-4444-555555555555'

describe('buildCidMap', () => {
  it('strips the angle brackets a Content-ID header carries', () => {
    const map = buildCidMap([{ id: ID, contentId: '<f_mub9j9ol0>' }])
    expect(map.get('f_mub9j9ol0')).toBe(ID)
  })

  it('matches case-insensitively, and ignores attachments with no Content-ID', () => {
    const map = buildCidMap([
      { id: ID, contentId: 'F_ABC' },
      { id: OTHER_ID, contentId: null },
    ])
    expect(map.get('f_abc')).toBe(ID)
    expect(map.size).toBe(1)
  })

  it('survives absent input', () => {
    expect(buildCidMap(undefined).size).toBe(0)
  })
})

describe('inline images', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
  const cidSrc = new Map([['f_mub9j9ol0', PNG]])

  it('renders a cid from bytes the parent already fetched', () => {
    expect(resolveMessageHtml('<img data-cid="f_mub9j9ol0" alt="Logo">', { cidSrc })).toBe(
      `<img src="${PNG}" alt="Logo">`,
    )
  })

  it('drops an unresolved cid, leaving the alt text to stand in', () => {
    expect(resolveMessageHtml('<img data-cid="missing" alt="Logo">', { cidSrc })).toBe('<img alt="Logo">')
  })

  it('refuses anything that is not a base64 raster image', () => {
    // The substitution writes straight into a src attribute, so the value has
    // to be checked here and not merely trusted because we fetched it.
    for (const hostile of [
      '/api/admin/mailbox/attachments/../../etc/passwd',
      'https://tracker.example/p.gif',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,AAA" onerror="alert(1)',
    ]) {
      expect(resolveMessageHtml('<img data-cid="x">', { cidSrc: new Map([['x', hostile]]) })).toBe('<img>')
    }
  })
})

describe('remote images', () => {
  const html = '<p>hi</p><img data-remote-src="https://tracker.example/p.gif" width="1">'

  it('leaves them inert by default, so opening a message reports nothing', () => {
    const output = resolveMessageHtml(html)
    expect(output).not.toMatch(/\ssrc=/i)
    expect(output).toContain('data-remote-src')
  })

  it('loads them only when explicitly asked', () => {
    expect(resolveMessageHtml(html, { loadRemote: true })).toBe(
      '<p>hi</p><img src="https://tracker.example/p.gif" width="1">',
    )
  })

  it('reports whether there is anything to offer to load', () => {
    expect(hasDeferredRemoteImages(html)).toBe(true)
    expect(hasDeferredRemoteImages('<img data-cid="f_abc">')).toBe(false)
    expect(hasDeferredRemoteImages('<p>plain</p>')).toBe(false)
    expect(hasDeferredRemoteImages(null)).toBe(false)
  })
})

describe('both kinds in one message', () => {
  it('renders the logo and withholds the pixel', () => {
    const PNG = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
    const output = resolveMessageHtml(
      '<img data-cid="logo" alt="Acme"><p>Body</p><img data-remote-src="https://t/p.gif">',
      { cidSrc: new Map([['logo', PNG]]) },
    )

    expect(output).toContain(`src="${PNG}"`)
    expect(output).toContain('data-remote-src="https://t/p.gif"')
    // Exactly one src in the document, and it is the same-origin one.
    expect(output.match(/\ssrc=/gi)).toHaveLength(1)
  })
})
