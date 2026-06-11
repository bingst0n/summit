import { describe, it, expect } from 'vitest'
import { extractFirstUrl, htmlToText } from './fetchPage'

describe('extractFirstUrl', () => {
  it('finds an https url in prose', () => {
    expect(extractFirstUrl('check out https://example.com/course please')).toBe(
      'https://example.com/course'
    )
  })
  it('returns the first of several', () => {
    expect(extractFirstUrl('https://a.com and https://b.com')).toBe('https://a.com')
  })
  it('trims trailing punctuation', () => {
    expect(extractFirstUrl('see https://example.com/path.')).toBe('https://example.com/path')
    expect(extractFirstUrl('(https://example.com/path)')).toBe('https://example.com/path')
  })
  it('returns null when there is none', () => {
    expect(extractFirstUrl('no links here')).toBeNull()
    expect(extractFirstUrl('ftp://old.school')).toBeNull()
  })
})

describe('htmlToText', () => {
  it('strips tags, scripts, and styles', () => {
    const html =
      '<html><head><style>.x{color:red}</style><script>alert(1)</script></head>' +
      '<body><h1>Course</h1><ul><li>Unit 1</li><li>Unit 2</li></ul></body></html>'
    expect(htmlToText(html)).toBe('Course Unit 1 Unit 2')
  })
  it('decodes common entities and collapses whitespace', () => {
    expect(htmlToText('<p>A &amp; B&nbsp;&mdash; &quot;C&quot;</p>\n\n<p>D</p>')).toBe(
      'A & B — "C" D'
    )
  })
})
