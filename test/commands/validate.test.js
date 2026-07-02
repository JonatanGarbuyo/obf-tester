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

const mockReadFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}))

import { validateAndRecurse, runValidate, runBatch } from '../../src/commands/validate.js'

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

// --------------- runValidate ---------------

describe('runValidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates a single URL and logs singleResult on pass', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockFetchUrl.mockResolvedValue(mockResponse({ url: 'http://test.com/feed' }))

    await expect(runValidate({ url: 'test.com' })).rejects.toThrow('EXIT')

    expect(mockLogger.singleResult).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(0)
  })

  it('validates a single URL and exits with 1 on fail', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockFetchUrl.mockResolvedValue(mockResponse({ status: 500 }))

    await expect(runValidate({ url: 'test.com' })).rejects.toThrow('EXIT')

    expect(mockLogger.singleResult).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(1)
  })

  it('normalizes the URL before validation', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockFetchUrl.mockResolvedValue(mockResponse())

    await expect(runValidate({ url: 'test.com' })).rejects.toThrow('EXIT')

    const result = mockLogger.singleResult.mock.calls[0][0]
    expect(result.url).toBe('https://test.com')
  })

  it('uses recursive mode when --recursive is set', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockFetchUrl.mockResolvedValue(mockResponse({ url: 'http://test.com/sitemap' }))

    await expect(runValidate({ url: 'test.com', recursive: true, delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.validateHeader).toHaveBeenCalledOnce()
    expect(mockLogger.rowResult).toHaveBeenCalledOnce()
    expect(mockLogger.summary).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(0)
  })

  it('logs production URL warning in recursive mode without domain', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockFetchUrl.mockResolvedValue(mockResponse({ url: 'http://test.com/sitemap' }))

    await expect(runValidate({ url: 'test.com', recursive: true, delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.warn).toHaveBeenCalledOnce()
  })

  it('skips production warning when --domain is set in recursive mode', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockFetchUrl.mockResolvedValue(mockResponse({ url: 'http://localhost/feed' }))

    await expect(runValidate({ url: 'localhost', domain: 'http://localhost', recursive: true, delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })
})

// --------------- runBatch ---------------

describe('runBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads source and validates each URL', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockReadFileSync.mockReturnValue('/path1\n/path2\n')
    mockFetchUrl.mockResolvedValue(mockResponse())

    await expect(runBatch({ source: './feeds.txt', domain: 'http://localhost', delay: 0 })).rejects.toThrow('EXIT')

    expect(mockFetchUrl).toHaveBeenCalledTimes(2)
    expect(mockLogger.rowResult).toHaveBeenCalledTimes(2)
    expect(mockLogger.sourceInfo).toHaveBeenCalledOnce()
    expect(mockLogger.summary).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(0)
  })

  it('exits with error when source is empty', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockReadFileSync.mockReturnValue('')

    await expect(runBatch({ source: './empty.txt', domain: 'http://localhost' })).rejects.toThrow('EXIT')

    expect(mockLogger.error).toHaveBeenCalledWith('Source "./empty.txt" is empty')
    expect(mockLogger.exit).toHaveBeenCalledWith(1)
  })

  it('uses recursive mode for each URL', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockReadFileSync.mockReturnValue('/path1\n')
    mockFetchUrl.mockResolvedValue(mockResponse())

    await expect(runBatch({ source: './feeds.txt', domain: 'http://localhost', recursive: true, delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.rowResult).toHaveBeenCalledTimes(1)
    expect(mockLogger.summary).toHaveBeenCalledOnce()
    expect(mockLogger.exit).toHaveBeenCalledWith(0)
  })

  it('resolves relative paths with domain', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockReadFileSync.mockReturnValue('/relative/path\n')
    mockFetchUrl.mockResolvedValue(mockResponse())

    await expect(runBatch({ source: './feeds.txt', domain: 'http://localhost', delay: 0 })).rejects.toThrow('EXIT')

    const result = mockLogger.rowResult.mock.calls[0][0]
    expect(result.url).toBe('http://localhost/relative/path')
  })

  it('warns about production URLs when no domain', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })
    mockReadFileSync.mockReturnValue('https://example.com/feed\n')
    mockFetchUrl.mockResolvedValue(mockResponse())

    await expect(runBatch({ source: './feeds.txt', delay: 0 })).rejects.toThrow('EXIT')

    expect(mockLogger.warn).toHaveBeenCalledOnce()
  })
})
