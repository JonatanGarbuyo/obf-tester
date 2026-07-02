import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDiscover = vi.hoisted(() => vi.fn())
const mockFetchUrl = vi.hoisted(() => vi.fn())

vi.mock('../../src/parsers/robots.js', () => ({
  discover: mockDiscover,
}))

vi.mock('../../src/http.js', async (importOriginal) => {
  const http = await importOriginal()
  return { ...http, fetchUrl: mockFetchUrl }
})

const mockLogger = vi.hoisted(() => ({
  rowResult: vi.fn(),
  summary: vi.fn(),
  checkInfo: vi.fn(),
  sourceInfo: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
  childCount: vi.fn(),
}))

vi.mock('../../src/logger.js', () => mockLogger)

import { runCheck } from '../../src/commands/check.js'

function mockResponse(overrides = {}) {
  return {
    url: overrides.url ?? 'http://test.com',
    status: 200,
    statusText: 'OK',
    body: overrides.body ?? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/1</loc></url></urlset>',
    contentType: overrides.contentType ?? 'application/xml',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runCheck', () => {
  it('discovers sitemaps, validates each, logs results', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: [
        'https://example.com/sitemap1.xml',
        'https://example.com/sitemap2.xml',
      ],
      crawlDelay: null,
    })

    mockFetchUrl.mockResolvedValue(mockResponse({ url: 'https://example.com/sitemap1.xml' }))

    await expect(runCheck({ url: 'example.com', delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.checkInfo).toHaveBeenCalledOnce()
    expect(mockLogger.sourceInfo).toHaveBeenCalledOnce()
    expect(mockLogger.rowResult).toHaveBeenCalledTimes(2)
    expect(mockLogger.summary).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(0)
  })

  it('shows warning when validating against production URLs', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: ['https://example.com/sitemap.xml'],
      crawlDelay: null,
    })

    mockFetchUrl.mockResolvedValue(mockResponse())

    await expect(runCheck({ url: 'example.com', delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.warn).toHaveBeenCalledOnce()
  })

  it('does not warn when --local is set', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'http://localhost/robots.txt',
      sitemaps: ['http://localhost/sitemap.xml'],
      crawlDelay: null,
    })

    mockFetchUrl.mockResolvedValue(mockResponse())

    await expect(runCheck({ url: 'localhost', delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('exits with error when discover finds no sitemaps', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: [],
      crawlDelay: null,
    })

    await expect(runCheck({ url: 'example.com', delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.error).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(1)
  })

  it('follows sitemap-index children', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: ['https://example.com/sitemap-index.xml'],
      crawlDelay: null,
    })

    const sitemapIndexBody = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/child1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/child2.xml</loc></sitemap>
</sitemapindex>`

    mockFetchUrl
      .mockResolvedValueOnce(mockResponse({
        url: 'https://example.com/sitemap-index.xml',
        body: sitemapIndexBody,
        contentType: 'application/xml',
      }))
      .mockResolvedValue(mockResponse({ url: 'https://example.com/child.xml' }))

    await expect(runCheck({ url: 'example.com', delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.childCount).toHaveBeenCalledWith(2)
    expect(mockLogger.rowResult).toHaveBeenCalledTimes(3) // parent + 2 children
    expect(mockLogger.summary).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(0)
  })

  it('respects maxPagination', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: ['https://example.com/sitemap-index.xml'],
      crawlDelay: null,
    })

    const sitemapIndexBody = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/child1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/child2.xml</loc></sitemap>
  <sitemap><loc>https://example.com/child3.xml</loc></sitemap>
</sitemapindex>`

    mockFetchUrl
      .mockResolvedValueOnce(mockResponse({
        url: 'https://example.com/sitemap-index.xml',
        body: sitemapIndexBody,
        contentType: 'application/xml',
      }))
      .mockResolvedValue(mockResponse({ url: 'https://example.com/child.xml' }))

    await expect(runCheck({ url: 'example.com', maxPagination: 1, delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.childCount).toHaveBeenCalledWith(1)
    expect(mockLogger.rowResult).toHaveBeenCalledTimes(2) // parent + 1 child
  })

  it('passes exit(0) when all pass', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: ['https://example.com/sitemap.xml'],
      crawlDelay: null,
    })

    mockFetchUrl.mockResolvedValue(mockResponse({ status: 200 }))

    await expect(runCheck({ url: 'example.com', delay: 0 })).rejects.toThrow('EXIT')
    expect(mockLogger.exit).toHaveBeenCalledWith(0)
  })

  it('passes exit(1) when some fail', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: ['https://example.com/sitemap.xml'],
      crawlDelay: null,
    })

    mockFetchUrl.mockResolvedValue(mockResponse({ status: 500 }))

    await expect(runCheck({ url: 'example.com', delay: 0 })).rejects.toThrow('EXIT')
    expect(mockLogger.exit).toHaveBeenCalledWith(1)
  })
})
