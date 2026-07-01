import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  normalizeUrl,
  resolveUrl,
  isProdUrl,
} from '../src/http.js'

import {
  extractChildUrls,
  mapConcurrent,
  readSource,
} from '../src/extract.js'

const mockFetchUrl = vi.hoisted(() => vi.fn())

vi.mock('../src/http.js', async (importOriginal) => {
  const http = await importOriginal()
  return { ...http, fetchUrl: mockFetchUrl }
})

const mockLogger = vi.hoisted(() => ({
  rowResult: vi.fn(),
  summary: vi.fn(),
  childCount: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
  singleResult: vi.fn(),
  validateHeader: vi.fn(),
  sourceInfo: vi.fn(),
  checkInfo: vi.fn(),
  plain: vi.fn(),
}))

vi.mock('../src/logger.js', () => mockLogger)

import { validateAndRecurse } from '../src/commands/validate.js'

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

const sitemapIndexBody = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-3.xml</loc></sitemap>
</sitemapindex>`

// --------------- normalizeUrl ---------------

describe('normalizeUrl', () => {
  it('adds https for bare domain', () => {
    expect(normalizeUrl('canal26.com')).toBe('https://canal26.com')
  })

  it('adds http for localhost', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000')
  })

  it('adds http for 127.0.0.1', () => {
    expect(normalizeUrl('127.0.0.1')).toBe('http://127.0.0.1')
  })

  it('returns https:// as-is', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
  })

  it('returns http:// as-is', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
  })
})

// --------------- resolveUrl ---------------

describe('resolveUrl', () => {
  it('resolves relative path with domain', () => {
    expect(resolveUrl('/path/to/feed', 'http://localhost')).toBe('http://localhost/path/to/feed')
  })

  it('rewrites absolute URL when domain is given', () => {
    expect(resolveUrl('https://prod.com/feed', 'http://localhost')).toBe('http://localhost/feed')
  })

  it('returns absolute URL as-is when no domain', () => {
    expect(resolveUrl('https://prod.com/feed', undefined)).toBe('https://prod.com/feed')
  })

  it('throws for relative path without domain', () => {
    expect(() => resolveUrl('/path', undefined)).toThrow(/--domain/)
  })

  it('throws for invalid path', () => {
    expect(() => resolveUrl('invalid', 'http://localhost')).toThrow(/invalid/i)
  })

  it('preserves query string when rewriting', () => {
    expect(resolveUrl('https://prod.com/feed?from=0', 'http://localhost')).toBe('http://localhost/feed?from=0')
  })
})

// --------------- extractChildUrls ---------------

describe('extractChildUrls', () => {
  it('extracts <loc> from sitemapindex', () => {
    const body = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
    </sitemapindex>`
    expect(extractChildUrls(body)).toEqual([
      'https://example.com/sitemap-1.xml',
      'https://example.com/sitemap-2.xml',
    ])
  })

  it('returns empty array for urlset body', () => {
    const body = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page</loc></url>
    </urlset>`
    expect(extractChildUrls(body)).toEqual([])
  })

  it('returns empty array for non-XML body', () => {
    expect(extractChildUrls('just some text')).toEqual([])
  })

  it('returns empty array for empty body', () => {
    expect(extractChildUrls('')).toEqual([])
  })

  it('returns empty array for null body', () => {
    expect(extractChildUrls(null)).toEqual([])
  })

  it('returns empty array for undefined body', () => {
    expect(extractChildUrls(undefined)).toEqual([])
  })

  it('trims whitespace from extracted URLs', () => {
    const body = `<sitemapindex>
      <sitemap><loc>  https://example.com/sitemap.xml  </loc></sitemap>
    </sitemapindex>`
    expect(extractChildUrls(body)).toEqual(['https://example.com/sitemap.xml'])
  })
})

// --------------- isProdUrl ---------------

describe('isProdUrl', () => {
  it('returns false for localhost', () => {
    expect(isProdUrl('http://localhost/sitemap')).toBe(false)
  })

  it('returns false for 127.0.0.1', () => {
    expect(isProdUrl('http://127.0.0.1/sitemap')).toBe(false)
  })

  it('returns false for 0.0.0.0', () => {
    expect(isProdUrl('http://0.0.0.0/sitemap')).toBe(false)
  })

  it('returns true for real domain', () => {
    expect(isProdUrl('https://canal26.com/sitemap')).toBe(true)
  })

  it('returns true for invalid URL', () => {
    expect(isProdUrl('not-a-url')).toBe(true)
  })
})

// --------------- mapConcurrent ---------------

describe('mapConcurrent', () => {
  it('maps all items and maintains order', async () => {
    const result = await mapConcurrent([1, 2, 3], 2, (x) => Promise.resolve(x * 2))
    expect(result).toEqual([2, 4, 6])
  })

  it('handles empty array', async () => {
    const result = await mapConcurrent([], 5, (x) => Promise.resolve(x))
    expect(result).toEqual([])
  })

  it('handles concurrency larger than array length', async () => {
    const result = await mapConcurrent([1, 2], 100, (x) => Promise.resolve(x))
    expect(result).toEqual([1, 2])
  })

  it('preserves order with concurrent execution', async () => {
    const order = []
    await mapConcurrent([3, 1, 2], 2, async (x) => {
      await new Promise(r => setTimeout(r, x * 10))
      order.push(x)
      return x
    })
    // Results should be in original order
    expect(order.sort((a, b) => a - b)).toEqual([1, 2, 3])
  })
})

// --------------- validateAndRecurse ---------------

describe('validateAndRecurse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates a single URL with no children', async () => {
    mockFetchUrl.mockResolvedValue(mockResponse({ url: 'http://test.com/sitemap' }))
    const results = await validateAndRecurse('http://test.com/sitemap', {}, undefined, 0)
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('http://test.com/sitemap')
    expect(results[0].passed).toBe(true)
    expect(mockLogger.rowResult).toHaveBeenCalledOnce()
    expect(mockLogger.childCount).not.toHaveBeenCalled()
  })

  it('follows sitemap-index children', async () => {
    mockFetchUrl
      .mockResolvedValueOnce(mockResponse({
        url: 'http://test.com/index',
        body: sitemapIndexBody,
        contentType: 'application/xml',
      }))
      .mockResolvedValue(mockResponse({ url: 'http://test.com/child' }))

    const results = await validateAndRecurse('http://test.com/index', {}, undefined, 0)
    expect(results).toHaveLength(4) // 1 parent + 3 children
    expect(results[0].url).toBe('http://test.com/index')
    expect(mockFetchUrl).toHaveBeenCalledTimes(4)
    expect(mockLogger.childCount).toHaveBeenCalledWith(3)
    // 1 parent + 3 children rows
    expect(mockLogger.rowResult).toHaveBeenCalledTimes(4)
  })

  it('recurses on body content even when Content-Type is not XML', async () => {
    mockFetchUrl
      .mockResolvedValueOnce(mockResponse({
        url: 'http://test.com/index',
        body: sitemapIndexBody,
        contentType: 'text/html',
      }))
      .mockResolvedValue(mockResponse({ url: 'http://test.com/child' }))

    const results = await validateAndRecurse('http://test.com/index', {}, undefined, 0)
    expect(results).toHaveLength(4) // 1 parent + 3 children — detected by <sitemapindex in body
    expect(mockLogger.childCount).toHaveBeenCalledWith(3)
  })

  it('respects maxPagination', async () => {
    mockFetchUrl
      .mockResolvedValueOnce(mockResponse({
        url: 'http://test.com/index',
        body: sitemapIndexBody,
        contentType: 'application/xml',
      }))
      .mockResolvedValue(mockResponse({ url: 'http://test.com/child' }))

    const results = await validateAndRecurse('http://test.com/index', { maxPagination: 2 }, undefined, 0)
    expect(results).toHaveLength(3) // 1 parent + 2 children
    expect(mockFetchUrl).toHaveBeenCalledTimes(3)
    expect(mockLogger.childCount).toHaveBeenCalledWith(2)
  })
})

// --------------- readSource ---------------

const mockReadFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}))

describe('readSource', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
  })

  it('skips comments and empty lines', async () => {
    mockReadFileSync.mockReturnValue(
      '# this is a comment\n/valid/path\n\n# another comment\n/second/path\n'
    )
    const lines = await readSource('./test.txt')
    expect(lines).toEqual(['/valid/path', '/second/path'])
  })

  it('trims whitespace from lines', async () => {
    mockReadFileSync.mockReturnValue('  /path/1  \n  /path/2  \n')
    const lines = await readSource('./test.txt')
    expect(lines).toEqual(['/path/1', '/path/2'])
  })
})
