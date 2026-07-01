import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchUrl = vi.hoisted(() => vi.fn())

vi.mock('../src/fetcher.js', () => ({
  fetchUrl: mockFetchUrl,
}))

import { discover } from '../src/discover.js'

beforeEach(() => {
  vi.clearAllMocks()
})

function mockFetchResponse(overrides = {}) {
  return {
    url: overrides.url ?? 'http://test.com/robots.txt',
    status: overrides.status ?? 200,
    statusText: overrides.statusText ?? 'OK',
    body: overrides.body ?? '',
    contentType: overrides.contentType ?? 'text/plain',
  }
}

describe('discover', () => {
  it('extracts sitemap URLs from robots.txt', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: `User-agent: *
Disallow: /admin

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/news-sitemap.xml`,
    }))
    const result = await discover('https://example.com')
    expect(result.source).toBe('https://example.com/robots.txt')
    expect(result.sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/news-sitemap.xml',
    ])
    expect(result.error).toBeUndefined()
  })

  it('returns empty array when robots.txt has no Sitemap entries', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: `User-agent: *
Disallow: /private`,
    }))
    const result = await discover('https://example.com')
    expect(result.sitemaps).toEqual([])
    expect(result.error).toBeUndefined()
  })

  it('returns error when robots.txt returns 404', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      status: 404,
      statusText: 'Not Found',
      body: '',
    }))
    const result = await discover('https://example.com')
    expect(result.sitemaps).toEqual([])
    expect(result.error).toMatch(/404/)
  })

  it('returns error when fetch fails', async () => {
    mockFetchUrl.mockRejectedValue(new Error('ENOTFOUND'))
    const result = await discover('https://example.com')
    expect(result.sitemaps).toEqual([])
    expect(result.error).toMatch(/ENOTFOUND/)
  })

  it('filters out empty Sitemap lines', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: `Sitemap: https://example.com/valid.xml
Sitemap: 
Sitemap:   `,
    }))
    const result = await discover('https://example.com')
    expect(result.sitemaps).toEqual(['https://example.com/valid.xml'])
  })

  it('trims whitespace from Sitemap URLs', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: 'Sitemap:   https://example.com/sitemap.xml   ',
    }))
    const result = await discover('https://example.com')
    expect(result.sitemaps).toEqual(['https://example.com/sitemap.xml'])
  })

  it('does not double-add /robots.txt when URL already ends in /robots.txt', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: 'Sitemap: https://example.com/sitemap.xml',
    }))
    const result = await discover('https://example.com/robots.txt')
    expect(result.source).toBe('https://example.com/robots.txt')
    expect(mockFetchUrl).toHaveBeenCalledWith('https://example.com/robots.txt')
  })

  it('matches Sitemap: case-insensitively', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: 'sitemap: https://example.com/lowercase.xml',
    }))
    const result = await discover('https://example.com')
    expect(result.sitemaps).toEqual(['https://example.com/lowercase.xml'])
  })

  it('returns null crawlDelay when not present', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: 'Sitemap: https://example.com/sitemap.xml',
    }))
    const result = await discover('https://example.com')
    expect(result.crawlDelay).toBeNull()
  })

  it('extracts Crawl-Delay in seconds and converts to ms', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: `User-agent: *
Crawl-Delay: 5
Sitemap: https://example.com/sitemap.xml`,
    }))
    const result = await discover('https://example.com')
    expect(result.crawlDelay).toBe(5000)
  })

  it('extracts fractional Crawl-Delay', async () => {
    mockFetchUrl.mockResolvedValue(mockFetchResponse({
      body: `User-agent: *
Crawl-Delay: 1.5
Sitemap: https://example.com/sitemap.xml`,
    }))
    const result = await discover('https://example.com')
    expect(result.crawlDelay).toBe(1500)
  })

  it('returns crawlDelay null on fetch error', async () => {
    mockFetchUrl.mockRejectedValue(new Error('ENOTFOUND'))
    const result = await discover('https://example.com')
    expect(result.crawlDelay).toBeNull()
  })
})
