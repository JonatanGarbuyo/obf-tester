import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchUrl = vi.hoisted(() => vi.fn())

vi.mock('../src/http.js', () => ({
  fetchUrl: mockFetchUrl,
}))

import { validate } from '../src/validate.js'

beforeEach(() => {
  vi.clearAllMocks()
})

function mockResponse(overrides = {}) {
  return {
    url: 'http://test.com',
    status: 200,
    statusText: 'OK',
    body: 'some content',
    contentType: 'text/plain',
    ...overrides,
  }
}

// --------------- HTTP status ---------------

describe('status check', () => {
  it('passes for 200', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ status: 200 }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'status')
    expect(check.passed).toBe(true)
    expect(check.detail).toBe('200')
  })

  it('passes for 2xx range', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ status: 299 }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'status')
    expect(check.passed).toBe(true)
  })

  it('fails for 404', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ status: 404, statusText: 'Not Found' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'status')
    expect(check.passed).toBe(false)
    expect(check.detail).toMatch(/404/)
  })

  it('fails for 500', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ status: 500, statusText: 'Internal Server Error' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'status')
    expect(check.passed).toBe(false)
  })

  it('fails for redirect (301) that did not resolve', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ status: 301, statusText: 'Moved Permanently' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'status')
    expect(check.passed).toBe(false)
    expect(check.detail).toMatch(/redirect/i)
  })
})

// --------------- body-not-empty ---------------

describe('body-not-empty check', () => {
  it('passes when body has content', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'hello' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'body-not-empty')
    expect(check.passed).toBe(true)
  })

  it('passes when body is large', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'x'.repeat(10000) }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'body-not-empty')
    expect(check.passed).toBe(true)
    expect(check.detail).toMatch(/10000/)
  })

  it('fails when body is empty string', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: '' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'body-not-empty')
    expect(check.passed).toBe(false)
  })

  it('fails when body is whitespace only', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: '   \n  ' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'body-not-empty')
    expect(check.passed).toBe(false)
  })
})

// --------------- content-type ---------------

describe('content-type check', () => {
  it('passes when no expectedContentType is set', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ contentType: 'whatever/thing' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'content-type')
    expect(check.passed).toBe(true)
  })

  it('passes when contentType matches exactly', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ contentType: 'application/xml' }))
    const result = await validate('http://test.com', { expectedContentType: 'application/xml' })
    const check = result.checks.find(c => c.check === 'content-type')
    expect(check.passed).toBe(true)
  })

  it('passes when contentType matches XML-family flexibly', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ contentType: 'application/rss+xml' }))
    const result = await validate('http://test.com', { expectedContentType: 'application/xml' })
    const check = result.checks.find(c => c.check === 'content-type')
    expect(check.passed).toBe(true)
  })

  it('passes with text/xml expecting application/xml', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ contentType: 'text/xml' }))
    const result = await validate('http://test.com', { expectedContentType: 'application/xml' })
    const check = result.checks.find(c => c.check === 'content-type')
    expect(check.passed).toBe(true)
  })

  it('fails when contentType does not match expected', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ contentType: 'text/html' }))
    const result = await validate('http://test.com', { expectedContentType: 'application/json' })
    const check = result.checks.find(c => c.check === 'content-type')
    expect(check.passed).toBe(false)
    expect(check.detail).toMatch(/expected.*application\/json.*got.*text\/html/)
  })

  it('fails when contentType is unexpectedly text/html for xml type', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ contentType: 'text/html' }))
    const result = await validate('http://test.com', { expectedContentType: 'application/xml' })
    const check = result.checks.find(c => c.check === 'content-type')
    expect(check.passed).toBe(false)
  })
})

// --------------- forbidden patterns ---------------

describe('forbidden-pattern check', () => {
  it('passes when no forbidden patterns found', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'clean content' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'forbidden-pattern')
    expect(check.passed).toBe(true)
  })

  it('fails when body contains stack trace pattern', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'error\n    at Object.<anonymous> (file.js:1:1)' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'forbidden-pattern')
    expect(check.passed).toBe(false)
  })

  it('fails when body contains "Fatal error"', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'PHP Fatal error: Out of memory' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'forbidden-pattern')
    expect(check.passed).toBe(false)
  })

  it('fails when body contains "Catchable fatal error"', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'Catchable fatal error: Argument 1 must be...' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'forbidden-pattern')
    expect(check.passed).toBe(false)
  })

  it('fails when body contains "Traceback"', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'Traceback (most recent call last):\n  File "x.py"' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'forbidden-pattern')
    expect(check.passed).toBe(false)
  })

  it('fails when body contains "[object Object]"', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ body: 'data: [object Object]' }))
    const result = await validate('http://test.com')
    const check = result.checks.find(c => c.check === 'forbidden-pattern')
    expect(check.passed).toBe(false)
  })
})

// --------------- fetch error ---------------

describe('fetch error handling', () => {
  it('returns passed=false when fetch throws', async () => {
    mockFetchUrl.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await validate('http://test.com')
    expect(result.passed).toBe(false)
    const check = result.checks.find(c => c.check === 'fetch')
    expect(check.passed).toBe(false)
    expect(check.detail).toMatch(/ECONNREFUSED/)
  })
})

// --------------- result shape ---------------

describe('result shape', () => {
  it('returns url, passed, checks, body, contentType', async () => {
    const response = mockResponse({
      body: '<rss><channel><title>T</title></channel></rss>',
      contentType: 'text/xml',
    })
    mockFetchUrl.mockResolvedValue(response)
    const result = await validate('http://test.com')
    expect(result.url).toBe('http://test.com')
    expect(typeof result.passed).toBe('boolean')
    expect(Array.isArray(result.checks)).toBe(true)
    expect(result.body).toBe(response.body)
    expect(result.contentType).toBe(response.contentType)
  })

  it.each([200, 299, 404, 500])('returns passed=false for non-200 status %d', async (status) => {
    mockFetchUrl.mockResolvedValue(mockResponse({ status }))
    const result = await validate('http://test.com')
    if (status === 200 || status === 299) {
      expect(result.passed).toBe(true)
    } else {
      expect(result.passed).toBe(false)
    }
  })
})

// --------------- type option triggers XML checks ---------------

describe('type option triggers XML validation', () => {
  it('runs XML validations when type is set to rss', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({
      body: '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://x.com</link><item><title>A</title><link>https://x.com</link></item></channel></rss>',
      contentType: 'text/plain',
    }))
    const result = await validate('http://test.com', { type: 'rss' })
    const rssChannel = result.checks.find(c => c.check === 'rss-channel')
    expect(rssChannel.passed).toBe(true)
  })

  it('skips XML validations when no type and non-XML content-type', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({
      body: '<html><body>404</body></html>',
      contentType: 'text/html',
    }))
    const result = await validate('http://test.com')
    const xmlChecks = result.checks.filter(c => c.check.startsWith('xml-') || c.check.startsWith('rss-'))
    expect(xmlChecks).toHaveLength(0)
  })

  it('runs XML validations when contentType is XML even without type', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({
      body: '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://x.com</link><item><title>A</title><link>https://x.com</link></item></channel></rss>',
      contentType: 'application/rss+xml',
    }))
    const result = await validate('http://test.com')
    const rssChannel = result.checks.find(c => c.check === 'rss-channel')
    expect(rssChannel).toBeDefined()
    expect(rssChannel.passed).toBe(true)
  })
})
