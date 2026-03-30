import DOMPurify from 'dompurify'

function normalizeWhitespace(value, preserveLineBreaks) {
    if (preserveLineBreaks) {
        return value
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .split('\n')
            .map(line => line.replace(/[\t\f\v ]+/g, ' ').trim())
            .join('\n')
            .trim()
    }

    return value.replace(/\s+/g, ' ').trim()
}

export function sanitizePlainText(value, options = {}) {
    const { maxLength, preserveLineBreaks = false } = options
    const source = typeof value === 'string' ? value : ''
    const sanitized = DOMPurify.sanitize(source, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true
    })

    const normalized = normalizeWhitespace(sanitized, preserveLineBreaks)
    if (!maxLength || normalized.length <= maxLength) return normalized
    return normalized.slice(0, maxLength).trim()
}

export function sanitizeImageUrl(url) {
    if (!url || typeof url !== 'string') return ''

    try {
        const parsed = new URL(url)
        if (!['https:', 'http:'].includes(parsed.protocol)) return ''
        return parsed.toString()
    } catch {
        return ''
    }
}