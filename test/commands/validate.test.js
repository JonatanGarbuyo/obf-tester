import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchUrl = vi.hoisted(() => vi.fn())

vi.mock('../../src/http.js', async (importOriginal) => {
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

vi.mock('../../src/logger.js', () => mockLogger)

import { validateAndRecurse } from '../../src/commands/validate.js'

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
