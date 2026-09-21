import { describe, expect, it } from 'vitest'
import { safeUrl, sanitizeEmailHtml } from './sanitizeHtml.js'

const clean = (input) => sanitizeEmailHtml(input).html

describe('safeUrl', () => {
  it('allows the three schemes an email may link with', () => {
    expect(safeUrl('https://example.com/a?b=c')).toBe('https://example.com/a?b=c')
    expect(safeUrl('http://example.com')).toBe('http://example.com')
    expect(safeUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com')
  })

  it('rejects javascript: however it is disguised', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeUrl('  javascript:alert(1)')).toBeNull()
    // Browsers strip these while resolving the scheme; so must we, BEFORE the
    // allowlist check rather than after it.
    expect(safeUrl('java\tscript:alert(1)')).toBeNull()
    expect(safeUrl('java\nscript:alert(1)')).toBeNull()
    expect(safeUrl('java\u0000script:alert(1)')).toBeNull()
  })

  it('rejects data:, vbscript: and relative URLs', () => {
    expect(safeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    expect(safeUrl('vbscript:msgbox')).toBeNull()
    expect(safeUrl('/admin/lead-crm')).toBeNull()
    expect(safeUrl('//evil.example')).toBeNull()
    expect(safeUrl('')).toBeNull()
  })
})

describe('sanitizeEmailHtml — script execution', () => {
  it('removes a script element and its contents', () => {
    expect(clean('<p>before</p><script>alert(1)</script><p>after</p>')).toBe('<p>before</p><p>after</p>')
  })

  it('does not treat markup inside a script as markup', () => {
    // The classic bypass: if script content is parsed as markup, the `</div>`
    // inside the string terminates an element the sanitizer thinks is open.
    const out = clean('<div><script>var a = "</div>"; alert(1)</script>ok</div>')
    expect(out).not.toContain('alert')
    expect(out).toContain('ok')
  })

  it('strips every event handler attribute', () => {
    const out = clean('<p onclick="alert(1)" onmouseover="alert(2)">text</p>')
    expect(out).toBe('<p>text</p>')
  })

  it('drops a javascript: href but keeps the link text', () => {
    const out = clean('<a href="javascript:alert(1)">click</a>')
    expect(out).toBe('<a target="_blank" rel="noopener noreferrer nofollow">click</a>')
    expect(out).not.toContain('javascript')
  })

  it('removes style elements and style attributes', () => {
    expect(clean('<style>body{background:url(http://x/y)}</style><p>hi</p>')).toBe('<p>hi</p>')
    expect(clean('<p style="position:fixed;top:0">hi</p>')).toBe('<p>hi</p>')
  })

  it('removes svg, math, iframe, object and form subtrees', () => {
    expect(clean('<svg><script>alert(1)</script></svg>x')).toBe('x')
    expect(clean('<math><mtext>y</mtext></math>x')).toBe('x')
    expect(clean('<iframe src="http://evil"></iframe>x')).toBe('x')
    expect(clean('<object data="http://evil"><param name="a"></object>x')).toBe('x')
    expect(clean('<form action="http://evil"><input name="p"></form>x')).toBe('x')
  })

  it('drops conditional comments rather than reasoning about them', () => {
    expect(clean('<!--[if mso]><script>alert(1)</script><![endif]-->ok')).toBe('ok')
    expect(clean('<!-- plain comment -->ok')).toBe('ok')
  })

  it('escapes an unterminated comment instead of dropping the rest of the message', () => {
    // An unclosed comment swallows everything after it, which is a denial of
    // content rather than a security hole — but it should be visible.
    expect(clean('ok<!-- never closed')).toBe('ok')
  })
})

describe('sanitizeEmailHtml — remote content', () => {
  it('defers a remote image instead of loading it, and reports it', () => {
    const result = sanitizeEmailHtml('<p>hi</p><img src="https://tracker.example/pixel.gif" width="1">')
    // The element survives so the operator can choose to load it; the URL is
    // parked on data-remote-src, which no browser fetches.
    expect(result.html).toBe('<p>hi</p><img data-remote-src="https://tracker.example/pixel.gif" width="1">')
    expect(result.strippedRemoteContent).toBe(true)
  })

  it('NEVER emits a src attribute, whatever the input', () => {
    // The single invariant this whole design rests on. A `src` reaching the
    // rendered document is a request leaving the machine, and for a tracking
    // pixel that request IS the payload.
    for (const input of [
      '<img src="https://x/y.png">',
      '<img SRC="HTTPS://X/Y.PNG">',
      '<img src="cid:logo123">',
      '<img src="data:image/png;base64,AAAA">',
      '<img src="javascript:alert(1)">',
      '<img src="/relative.png">',
    ]) {
      expect(sanitizeEmailHtml(input).html).not.toMatch(/\ssrc=/i)
    }
  })

  it('keeps an image alt text, so a picture-led message still says something', () => {
    const result = sanitizeEmailHtml('<img src="https://x/y.png" alt="Quarterly results">')
    expect(result.html).toBe('<img data-remote-src="https://x/y.png" alt="Quarterly results">')
    expect(result.strippedRemoteContent).toBe(true)
  })

  it('keeps an inline cid image without calling it remote content', () => {
    // A cid: image is already in our own R2 bucket, so rendering it costs no
    // network request and leaks nothing. Reporting it as stripped remote
    // content would make the UI warn about a privacy risk that is not there.
    const result = sanitizeEmailHtml('<img src="cid:f_mub9j9ol0" alt="Logo" width="120">')
    expect(result.html).toBe('<img data-cid="f_mub9j9ol0" alt="Logo" width="120">')
    expect(result.strippedRemoteContent).toBe(false)
  })

  it('tolerates the angle brackets some senders wrap a cid in', () => {
    expect(sanitizeEmailHtml('<img src="cid:<f_abc>">').html).toBe('<img data-cid="f_abc">')
  })

  it('drops an image that carries neither a usable source nor alt text', () => {
    expect(sanitizeEmailHtml('<img src="data:image/png;base64,AAAA">').html).toBe('')
    expect(sanitizeEmailHtml('<img>').html).toBe('')
  })

  it('removes media, link and meta elements', () => {
    const result = sanitizeEmailHtml('<link rel="stylesheet" href="https://x/a.css"><video src="https://x/v.mp4"></video><meta http-equiv="refresh" content="0;url=http://evil">ok')
    expect(result.html).toBe('ok')
    expect(result.strippedRemoteContent).toBe(true)
  })

  it('reports no stripping for a message that had none', () => {
    const result = sanitizeEmailHtml('<p>Just text and a <a href="https://example.com">link</a>.</p>')
    expect(result.strippedRemoteContent).toBe(false)
  })
})

describe('sanitizeEmailHtml — ordinary mail', () => {
  it('keeps the formatting people actually use', () => {
    const out = clean('<p>Hi <strong>there</strong>,</p><ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote>')
    expect(out).toBe('<p>Hi <strong>there</strong>,</p><ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote>')
  })

  it('keeps tables with their spans, clamped and re-emitted as numbers', () => {
    expect(clean('<table><tr><td colspan="2">a</td></tr></table>')).toBe(
      '<table><tr><td colspan="2">a</td></tr></table>',
    )
    expect(clean('<td colspan="99999999">a</td>')).toBe('<td colspan="1000">a</td>')
    expect(clean('<td colspan="abc">a</td>')).toBe('<td>a</td>')
  })

  it('adds noopener to links it keeps', () => {
    expect(clean('<a href="https://example.com" title="t">go</a>')).toBe(
      '<a href="https://example.com" title="t" target="_blank" rel="noopener noreferrer nofollow">go</a>',
    )
  })

  it('unwraps unknown elements rather than losing their content', () => {
    expect(clean('<o:p>Outlook paragraph</o:p>')).toBe('Outlook paragraph')
    expect(clean('<center>centred</center>')).toBe('centred')
  })

  it('escapes text, without double-escaping existing entities', () => {
    expect(clean('a &amp; b &lt; c')).toBe('a &amp; b &lt; c')
    expect(clean('Tom & Jerry')).toBe('Tom &amp; Jerry')
    expect(clean('5 < 6 and 7 > 6')).toBe('5 &lt; 6 and 7 &gt; 6')
  })

  it('closes elements the sender left open', () => {
    expect(clean('<p>one<p>two')).toBe('<p>one<p>two</p></p>')
    expect(clean('<b>bold')).toBe('<b>bold</b>')
  })

  it('recovers from mis-nesting instead of italicising the rest of the message', () => {
    const out = clean('<b><i>both</b>after')
    expect(out).toBe('<b><i>both</i></b>after')
  })

  it('handles void elements', () => {
    expect(clean('a<br>b<br/>c<hr>')).toBe('a<br>b<br>c<hr>')
  })

  it('survives an empty or absent body', () => {
    expect(clean('')).toBe('')
    expect(clean(null)).toBe('')
    expect(clean(undefined)).toBe('')
  })

  it('does not hang on malformed tag soup', () => {
    expect(() => clean('<<<>>><a href=<b<<')).not.toThrow()
    expect(() => clean('<a href="unterminated')).not.toThrow()
    expect(() => clean('</>' .repeat(500))).not.toThrow()
  })

  it('caps nesting, so deep input cannot become quadratic work', () => {
    // Closing a tag searches the open-element stack backwards. Without a cap,
    // 100k opening tags followed by 100k mismatched closing ones is O(n²) on
    // input bounded only by the 8 MiB parse limit — a CPU exhaustion inside a
    // Worker. The cap bounds that search to a constant.
    const attack = `${'<div>'.repeat(100_000)}${'</span>'.repeat(100_000)}`

    const started = Date.now()
    const result = sanitizeEmailHtml(attack, { maxLength: Number.MAX_SAFE_INTEGER })
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(3_000)
    // Content is kept; only the excess nesting is dropped.
    expect(result.html.startsWith('<div>')).toBe(true)
  })

  it('keeps the content of elements nested past the cap', () => {
    const deep = `${'<div>'.repeat(300)}hello${'</div>'.repeat(300)}`
    expect(clean(deep)).toContain('hello')
  })
})

describe('sanitizeEmailHtml — size', () => {
  it('truncates and re-closes rather than emitting half a tag', () => {
    const long = `<p>${'x'.repeat(5_000)}</p>`
    const result = sanitizeEmailHtml(long, { maxLength: 200 })
    expect(result.truncated).toBe(true)
    expect(result.html.length).toBeLessThanOrEqual(220)
    expect(result.html.endsWith('</p>')).toBe(true)
  })

  it('leaves a body under the limit untouched', () => {
    const result = sanitizeEmailHtml('<p>short</p>', { maxLength: 200 })
    expect(result.truncated).toBe(false)
    expect(result.html).toBe('<p>short</p>')
  })
})

describe('sanitizeEmailHtml - sender formatting', () => {
  it('keeps an inline style, so a branded message still looks like itself', () => {
    expect(clean('<p style="color:#c00;font-size:18px">Heading</p>')).toBe(
      '<p style="color: #c00; font-size: 18px">Heading</p>',
    )
  })

  it('drops the attribute entirely when nothing in it survives', () => {
    // Not `style=""`. An empty attribute is noise in every later diff.
    expect(clean('<p style="position:fixed">hi</p>')).toBe('<p>hi</p>')
  })

  it('refuses the whole attribute when a value tries to smuggle a fetch', () => {
    // Failing closed: the legal-looking `color` beside it is not salvaged,
    // because a message doing this is not one whose styling to trust.
    expect(clean('<p style="color:red;background-color:url(https://t/p.gif)">hi</p>')).toBe('<p>hi</p>')
  })

  it('keeps the table attributes templated mail lays itself out with', () => {
    expect(clean('<table align="center" bgcolor="#f5f5f5" width="600"><tr><td valign="top">x</td></tr></table>')).toBe(
      '<table align="center" bgcolor="#f5f5f5" width="600"><tr><td valign="top">x</td></tr></table>',
    )
  })

  it('re-emits presentational values from a validated token, never from source', () => {
    expect(clean('<td bgcolor="url(https://t/p.gif)">x</td>')).toBe('<td>x</td>')
    expect(clean('<td align="center;position:fixed">x</td>')).toBe('<td>x</td>')
    expect(clean('<table width="600px">x</table>')).toBe('<table width="600px">x</table>')
    expect(clean('<table width="expression(alert(1))">x</table>')).toBe('<table>x</table>')
  })

  it('still strips script and handlers from an element that carries style', () => {
    expect(clean('<p style="color:red" onclick="alert(1)">hi</p>')).toBe('<p style="color: red">hi</p>')
  })
})
