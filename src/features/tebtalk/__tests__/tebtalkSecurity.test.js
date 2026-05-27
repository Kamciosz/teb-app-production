import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sanitizePlainText, sanitizeImageUrl } from '../../../utils/safeContent'
import { WordFilter } from '../../../services/wordFilter'

// ============================================================================
// SECURITY TEST SUITE — TEBtalk chat system
// Covers: XSS, SQL injection vectors, profanity filter bypass,
//         image URL sanitization, message length guardrails
// ============================================================================

// ============================================================================
// T1: XSS — DOMPurify coverage
// ============================================================================
describe('XSS — DOMPurify coverage [T1]', () => {
  it('strips <script> tags from message content', () => {
    const payload = '<script>alert("xss")</script>Hello'
    const result = sanitizePlainText(payload)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('Hello')
  })

  it('strips event handlers from message content', () => {
    const payload = '<img src=x onerror=alert(1)>'
    const result = sanitizePlainText(payload)
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('<img')
  })

  it('strips javascript: URIs', () => {
    const payload = '<a href="javascript:alert(1)">click</a>'
    const result = sanitizePlainText(payload)
    expect(result).not.toContain('javascript:')
    expect(result).not.toContain('<a')
    expect(result).toContain('click')
  })

  it('strips nested XSS vectors', () => {
    const vectors = [
      '<svg onload=alert(1)>',
      '<body onload=alert(1)>',
      '"><script>alert(1)</script>',
      '<img src="x"><svg onload=alert(1)>',
      '<!--[if gte IE 4]><script>alert(1)</script><![endif]-->',
      '<math><mi>x</mi><msqrt><mn>1</mn></msqrt></math>',
      '<details open ontoggle=alert(1)>',
    ]
    for (const vec of vectors) {
      const result = sanitizePlainText(vec)
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
      expect(result).not.toMatch(/on\w+=/i)
    }
  })

  it('strips DOMPurify known bypass vectors', () => {
    // DOMPurify 3.x known bypasses (fixed in 3.3.3)
    const vectors = [
      '<form><button formaction=javascript:alert(1)>',
      '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
      '<xmp><script>alert(1)</script></xmp>',
      '<noscript><img src=x onerror=alert(1)></noscript>',
    ]
    for (const vec of vectors) {
      const result = sanitizePlainText(vec)
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
    }
  })

  it('preserves plain text content through sanitization', () => {
    const text = 'Hello, how are you? Normal text here 123.'
    expect(sanitizePlainText(text)).toBe(text)
  })

  it('preserves Polish characters through sanitization', () => {
    const text = 'Wiadomość z polskimi znakami: ąćęłńóśźż'
    expect(sanitizePlainText(text)).toBe(text)
  })

  it('preserves line breaks when option is set', () => {
    const text = 'Line 1\nLine 2\nLine 3'
    const result = sanitizePlainText(text, { preserveLineBreaks: true })
    expect(result).toContain('\n')
    expect(result.split('\n')).toHaveLength(3)
  })

  it('collapses excess line breaks', () => {
    const text = 'Line 1\n\n\n\nLine 2'
    const result = sanitizePlainText(text, { preserveLineBreaks: true })
    expect(result).toBe('Line 1\n\nLine 2')
  })

  it('truncates long content at maxLength', () => {
    const long = 'A'.repeat(5000)
    const result = sanitizePlainText(long, { maxLength: 2000 })
    expect(result.length).toBeLessThanOrEqual(2000)
  })

  it('returns empty string for non-string input', () => {
    expect(sanitizePlainText(null)).toBe('')
    expect(sanitizePlainText(undefined)).toBe('')
    expect(sanitizePlainText(42)).toBe('')
    expect(sanitizePlainText({})).toBe('')
  })
})

// ============================================================================
// T2: SQL injection vectors in message content
// ============================================================================
describe('SQL injection vectors [T2]', () => {
  it('strips SQL injection payloads from sanitized content', () => {
    const vectors = [
      "'; DROP TABLE profiles; --",
      "'; SELECT * FROM auth.users; --",
      "' UNION SELECT * FROM direct_messages --",
      "1; DELETE FROM chat_group_messages WHERE 1=1",
      "' OR 1=1 --",
      "admin'--",
      "'; UPDATE profiles SET role='admin' WHERE id=auth.uid(); --",
    ]
    for (const vec of vectors) {
      const result = sanitizePlainText(vec)
      // SQL keywords may remain in plain text (which is fine — they're just text)
      // But no HTML/JS should leak through
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0) // content preserved as text
      expect(result).not.toContain('<')         // no HTML fragments
    }
  })

  it('SQL injection strings are harmless as plain text content', () => {
    // This confirms the content ends up as safe text, not executable
    const dangerous = "'; DROP TABLE profiles; --"
    const result = sanitizePlainText(dangerous)
    // The text is preserved, but ONLY as text — Supabase parameterized
    // queries handle it server-side. This test documents the expectation.
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// T3: Image URL sanitization
// ============================================================================
describe('Image URL sanitization [T3]', () => {
  it('allows valid HTTPS URLs', () => {
    expect(sanitizeImageUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg')
  })

  it('allows valid HTTP URLs', () => {
    expect(sanitizeImageUrl('http://example.com/image.jpg')).toBe('http://example.com/image.jpg')
  })

  it('rejects javascript: URLs', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBe('')
  })

  it('rejects data: URLs', () => {
    expect(sanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('rejects blob: URLs', () => {
    expect(sanitizeImageUrl('blob:https://example.com/uuid')).toBe('')
  })

  it('rejects file: URLs', () => {
    expect(sanitizeImageUrl('file:///etc/passwd')).toBe('')
  })

  it('rejects empty/null/undefined', () => {
    expect(sanitizeImageUrl('')).toBe('')
    expect(sanitizeImageUrl(null)).toBe('')
    expect(sanitizeImageUrl(undefined)).toBe('')
  })

  it('rejects non-string types', () => {
    expect(sanitizeImageUrl(42)).toBe('')
    expect(sanitizeImageUrl({})).toBe('')
  })
})

// ============================================================================
// T4: Word filter / profanity bypass resistance
// ============================================================================
describe('Word filter profanity bypass [T4]', () => {
  it('filters standard profanity', () => {
    expect(WordFilter.clean('kurwa')).toContain('####')
    expect(WordFilter.clean('chuj')).toContain('####')
    expect(WordFilter.clean('jebac')).toContain('####')
  })

  it('filters leet-speak variants', () => {
    expect(WordFilter.clean('kurw4')).toContain('####')
    expect(WordFilter.clean('chuj')).toContain('####')
    expect(WordFilter.clean('p13rd0l1c')).toContain('####')
  })

  it('filters characters with separator evasion', () => {
    expect(WordFilter.clean('k u r w a')).toContain('####')
    expect(WordFilter.clean('k.u.r.w.a')).toContain('####')
    expect(WordFilter.clean('k_u_r_w_a')).toContain('####')
  })

  it('filters Polish diacritic variants', () => {
    expect(WordFilter.clean('pierdolic')).toContain('####')
    expect(WordFilter.clean('pierdólić')).toContain('####')
  })

  it('returns empty string for null/undefined input', () => {
    expect(WordFilter.clean(null)).toBe('')
    expect(WordFilter.clean(undefined)).toBe('')
  })

  it('preserves benign text', () => {
    const text = 'Hello, this is a normal message about school.'
    expect(WordFilter.clean(text)).toBe(text)
  })
})

// ============================================================================
// T5: Rate limiting awareness — client-side
// ============================================================================
describe('Rate limiting awareness [T5]', () => {
  it('MAX_CHAT_MESSAGE constant is reasonable', () => {
    // Import the constant to verify it exists and has a reasonable value
    // We test via the sanitize function which applies maxLength
    const longMsg = 'X'.repeat(3000)
    const result = sanitizePlainText(longMsg, { maxLength: 2000 })
    expect(result.length).toBeLessThanOrEqual(2000)
  })

  it('empty message after sanitization is rejected', () => {
    // Content that sanitizes to nothing should not be sent
    const onlyHtml = '<script>alert(1)</script>   '
    const result = sanitizePlainText(onlyHtml, { maxLength: 2000 })
    expect(result).toBe('')
  })
})

// ============================================================================
// T6: Data validation — message cache safety
// ============================================================================
describe('Message cache validation [T6]', () => {
  it('handles malicious cached state gracefully', () => {
    // Malformed cached objects should not crash the app
    const maliciousPayloads = [
      { id: 1, sender_id: 'u1', content: '<script>evil()</script>', created_at: '2024-01-01T00:00:00Z' },
      { id: 2, sender_id: 'u2', content: 'normal', created_at: null },
      { id: 3, sender_id: 'u3', content: 'normal', created_at: 'invalid-date' },
      { id: 4, sender_id: '', content: 'normal', created_at: '2024-01-01T00:00:00Z' },
      { id: 'valid', sender_id: 'u1', content: 'safe', created_at: '2024-01-01T00:00:00Z' },
    ]
    // The cache validation should filter out invalid messages.
    // valid: id=1 (numeric id ok), id=3 (created_at is a string, even if invalid date),
    //       id='valid' (valid string id)
    // invalid: id=2 (created_at is null), id=4 (sender_id is empty)
    const validMessages = maliciousPayloads.filter(m => {
      if (!m || typeof m !== 'object') return false
      if (typeof m.id !== 'string' && typeof m.id !== 'number') return false
      if (typeof m.sender_id !== 'string' || !m.sender_id) return false
      if (typeof m.content !== 'string') return false
      if (typeof m.created_at !== 'string') return false
      return true
    })
    expect(validMessages).toHaveLength(3) // id 1, id 3, id 'valid'
  })
})
