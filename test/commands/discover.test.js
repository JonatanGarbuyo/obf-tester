import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDiscover = vi.hoisted(() => vi.fn())

vi.mock('../../src/parsers/robots.js', () => ({
  discover: mockDiscover,
}))

const mockLogger = vi.hoisted(() => ({
  plain: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
}))

vi.mock('../../src/logger.js', () => mockLogger)

import { runDiscover } from '../../src/commands/discover.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runDiscover', () => {
  it('logs each sitemap URL with logger.plain', async () => {
    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: ['https://example.com/sitemap.xml', 'https://example.com/news.xml'],
      crawlDelay: null,
    })

    await runDiscover({ url: 'example.com' })

    expect(mockLogger.plain).toHaveBeenCalledTimes(2)
    expect(mockLogger.plain).toHaveBeenCalledWith('https://example.com/sitemap.xml')
    expect(mockLogger.plain).toHaveBeenCalledWith('https://example.com/news.xml')
    expect(mockLogger.error).not.toHaveBeenCalled()
    expect(mockLogger.exit).not.toHaveBeenCalled()
  })

  it('calls discover with normalized URL', async () => {
    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: ['https://example.com/sitemap.xml'],
      crawlDelay: null,
    })

    await runDiscover({ url: 'example.com' })

    expect(mockDiscover).toHaveBeenCalledWith('https://example.com')
  })

  it('calls logger.error and exit(1) when no sitemaps found', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: [],
      crawlDelay: null,
    })

    await expect(runDiscover({ url: 'example.com' })).rejects.toThrow('EXIT')

    expect(mockLogger.error).toHaveBeenCalledWith('No sitemaps found in https://example.com/robots.txt')
    expect(mockLogger.exit).toHaveBeenCalledWith(1)
  })

  it('includes fetch error detail when discover returns error', async () => {
    mockLogger.exit.mockImplementation(() => { throw new Error('EXIT') })

    mockDiscover.mockResolvedValue({
      source: 'https://example.com/robots.txt',
      sitemaps: [],
      crawlDelay: null,
      error: '404 Not Found',
    })

    await expect(runDiscover({ url: 'example.com' })).rejects.toThrow('EXIT')

    expect(mockLogger.error).toHaveBeenCalledWith(
      'No sitemaps found in https://example.com/robots.txt (404 Not Found)'
    )
    expect(mockLogger.exit).toHaveBeenCalledWith(1)
  })
})
