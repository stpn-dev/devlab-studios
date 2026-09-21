import { describe, expect, it } from 'vitest'
import { sanitizeStyleAttribute } from './sanitizeStyle.js'

/**
 * The CSS half of the sanitizer.
 *
 * This exists as its own module because a CSS grammar embedded in an HTML
 * tokenizer is how both end up wrong. The HTML side decides which ELEMENTS
 * survive; this decides which DECLARATIONS do, and the two are tested apart.
 *
 * The threat model is narrower than it looks. The rendered body lives in an
 * iframe with `sandbox=""` and `default-src 'none'`, so CSS here cannot run
 * script, load a font, or issue a request. What it can still do is leak a read
 * receipt through `url()` if the CSP is ever loosened for images, and hide or
 * reposition content so the message shown is not the message sent. Those two
 * are what the allowlist is aimed at.
 */

const clean = (input) => sanitizeStyleAttribute(input)

describe('properties that make mail look like mail', () => {
  it('keeps colour, type and spacing', () => {
    expect(clean('color: #1a1a1a')).toBe('color: #1a1a1a')
    expect(clean('background-color: rgb(240, 240, 240)')).toBe('background-color: rgb(240, 240, 240)')
    expect(clean('font-family: Arial, sans-serif')).toBe('font-family: Arial, sans-serif')
    expect(clean('font-size: 14px; font-weight: bold')).toBe('font-size: 14px; font-weight: bold')
    expect(clean('padding: 12px 8px; margin-top: 4px')).toBe('padding: 12px 8px; margin-top: 4px')
    expect(clean('text-align: center')).toBe('text-align: center')
    expect(clean('border: 1px solid #ddd; border-radius: 4px')).toBe('border: 1px solid #ddd; border-radius: 4px')
    expect(clean('line-height: 1.5; letter-spacing: .02em')).toBe('line-height: 1.5; letter-spacing: .02em')
  })

  it('keeps the table geometry a templated email is built from', () => {
    expect(clean('width: 600px; max-width: 100%')).toBe('width: 600px; max-width: 100%')
    expect(clean('vertical-align: top')).toBe('vertical-align: top')
  })

  it('keeps !important, which templated mail leans on', () => {
    expect(clean('color: #fff !important')).toBe('color: #fff !important')
  })

  it('normalises whitespace and case of the property name', () => {
    expect(clean('  COLOR :   red  ')).toBe('color: red')
  })

  it('drops a trailing empty declaration rather than emitting a bare semicolon', () => {
    expect(clean('color: red;')).toBe('color: red')
    expect(clean('color: red;;')).toBe('color: red')
  })
})

describe('properties that are refused', () => {
  it('refuses positioning, which is how content escapes its own message', () => {
    expect(clean('position: fixed; top: 0')).toBeNull()
    expect(clean('z-index: 99999')).toBeNull()
    expect(clean('transform: translateY(-100px)')).toBeNull()
  })

  it('refuses anything that hides content', () => {
    // A message whose rendered text differs from its actual text is a phishing
    // primitive. Nothing is hidden today either, because all CSS is currently
    // stripped, so refusing these is not a regression in fidelity.
    expect(clean('display: none')).toBeNull()
    expect(clean('visibility: hidden')).toBeNull()
    expect(clean('opacity: 0')).toBeNull()
    expect(clean('font-size: 0')).toBeNull()
  })

  it('keeps the allowed declarations when only some are refused', () => {
    expect(clean('color: red; position: fixed; font-size: 14px')).toBe('color: red; font-size: 14px')
  })

  it('allows display only for layout values', () => {
    expect(clean('display: block')).toBe('display: block')
    expect(clean('display: inline-block')).toBe('display: inline-block')
    expect(clean('display: table-cell')).toBe('display: table-cell')
    expect(clean('display: none')).toBeNull()
  })
})

describe('values that are refused', () => {
  it('refuses url(), the read receipt that survives an image block', () => {
    expect(clean('background-color: url(https://tracker.example/p.gif)')).toBeNull()
    expect(clean('border-image: url(https://x/y)')).toBeNull()
    // Spacing and case are not a disguise.
    expect(clean('background-color: URL ( https://x/y )')).toBeNull()
  })

  it('refuses CSS escapes, which spell url() without the letters', () => {
    expect(clean('background-color: \\75 rl(https://x/y)')).toBeNull()
    expect(clean('color: re\\64')).toBeNull()
  })

  it('refuses comments, which split a keyword the scanner is looking for', () => {
    expect(clean('background-color: u/**/rl(https://x/y)')).toBeNull()
    expect(clean('color: red /* comment */')).toBeNull()
  })

  it('refuses at-rules and expression()', () => {
    expect(clean('@import url(https://x/y)')).toBeNull()
    expect(clean('width: expression(alert(1))')).toBeNull()
  })

  it('refuses every function except the colour ones', () => {
    expect(clean('color: rgb(1, 2, 3)')).toBe('color: rgb(1, 2, 3)')
    expect(clean('color: rgba(1, 2, 3, .5)')).toBe('color: rgba(1, 2, 3, .5)')
    expect(clean('color: hsl(120, 50%, 50%)')).toBe('color: hsl(120, 50%, 50%)')
    expect(clean('width: calc(100% - 10px)')).toBeNull()
    expect(clean('color: var(--leak)')).toBeNull()
  })

  it('refuses angle brackets, so a value cannot close the attribute', () => {
    expect(clean('color: red"><script>alert(1)</script>')).toBeNull()
  })
})

describe('limits', () => {
  it('refuses a declaration longer than any real one', () => {
    expect(clean(`color: ${'a'.repeat(500)}`)).toBeNull()
  })

  it('caps the number of declarations rather than emitting unbounded style', () => {
    const many = Array.from({ length: 200 }, (_, i) => `padding-top: ${i}px`).join('; ')
    const result = clean(many)
    expect(result.split(';').length).toBeLessThanOrEqual(32)
  })

  it('returns null for empty or absent input rather than an empty attribute', () => {
    expect(clean('')).toBeNull()
    expect(clean(null)).toBeNull()
    expect(clean(undefined)).toBeNull()
    expect(clean('   ;  ; ')).toBeNull()
    expect(clean('nonsense')).toBeNull()
  })
})
