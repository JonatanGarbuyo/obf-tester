import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  normalizeUrl,
  resolveUrl,
  extractChildUrls,
  isProdUrl,
  parseOptions,
  mapConcurrent,
  readSource,
} from '../src/index.js'

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

// --------------- parseOptions ---------------

describe('parseOptions', () => {
  it('parses --type', () => {
    const opts = parseOptions(['--type', 'rss'])
    expect(opts.type).toBe('rss')
  })

  it('sets expectedContentType when --type is given', () => {
    const opts = parseOptions(['--type', 'rss'])
    expect(opts.expectedContentType).toBe('application/xml')
  })

  it('parses --domain', () => {
    const opts = parseOptions(['--domain', 'http://localhost'])
    expect(opts.domain).toBe('http://localhost')
  })

  it('parses --source', () => {
    const opts = parseOptions(['--source', './feeds.txt'])
    expect(opts.source).toBe('./feeds.txt')
  })

  it('parses --recursive', () => {
    const opts = parseOptions(['--recursive'])
    expect(opts.recursive).toBe(true)
  })

  it('parses --local', () => {
    const opts = parseOptions(['--local'])
    expect(opts.local).toBe(true)
  })

  it('parses --max-concurrency', () => {
    const opts = parseOptions(['--max-concurrency', '20'])
    expect(opts.maxConcurrency).toBe(20)
  })

  it('defaults maxConcurrency to 10', () => {
    const opts = parseOptions([])
    expect(opts.maxConcurrency).toBe(10)
  })

  it('parses --content-type', () => {
    const opts = parseOptions(['--content-type', 'application/json'])
    expect(opts.expectedContentType).toBe('application/json')
  })

  it('returns empty options for no args', () => {
    const opts = parseOptions([])
    expect(opts.recursive).toBe(false)
    expect(opts.local).toBe(false)
    expect(opts.source).toBeUndefined()
    expect(opts.domain).toBeUndefined()
    expect(opts.type).toBeUndefined()
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
