import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUrl, FetchError, normalizeUrl, resolveUrl, isProdUrl, mapConcurrent, appendDeploy } from '../src/http.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockHeaders(entries = { 'content-type': 'text/plain' }) {
  const map = new Map(Object.entries(entries))
  return {
    get: (name) => map.get(name.toLowerCase()) ?? null,
    forEach: (cb) => map.forEach((v, k) => cb(v, k)),
    [Symbol.iterator]() {
      return map[Symbol.iterator]()
    },
  }
}

function mockFetchResponse(overrides = {}) {
  const headers = overrides.headers || { 'content-type': 'text/plain' }
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    statusText: overrides.statusText ?? 'OK',
    url: overrides.url ?? 'http://test.com',
    headers: mockHeaders(headers),
    text: () => Promise.resolve(overrides.body ?? 'response body'),
  }
}

describe('fetchUrl', () => {
  it('returns correct shape on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse())
    const result = await fetchUrl('http://test.com')
    expect(result).toHaveProperty('url')
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('statusText')
    expect(result).toHaveProperty('headers')
    expect(result).toHaveProperty('contentType')
    expect(result).toHaveProperty('body')
    expect(result.status).toBe(200)
    expect(result.body).toBe('response body')
  })

  it('strips charset from content-type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({ headers: { 'content-type': 'text/xml; charset=utf-8' } })
    )
    const result = await fetchUrl('http://test.com')
    expect(result.contentType).toBe('text/xml')
  })

  it('uses resolved URL after redirect', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({ url: 'http://final.com/page' })
    )
    const result = await fetchUrl('http://test.com')
    expect(result.url).toBe('http://final.com/page')
  })

  it('sets User-Agent header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse())
    await fetchUrl('http://test.com')
    const [, opts] = spy.mock.calls[0]
    expect(opts.headers['User-Agent']).toBe('OBF-tester/0.1')
  })

  it('uses custom headers passed in options', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse())
    await fetchUrl('http://test.com', { headers: { 'X-Custom': 'foo' } })
    const [, opts] = spy.mock.calls[0]
    expect(opts.headers['X-Custom']).toBe('foo')
  })

  it('has redirect: follow', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse())
    await fetchUrl('http://test.com')
    const [, opts] = spy.mock.calls[0]
    expect(opts.redirect).toBe('follow')
  })
})

describe('fetchUrl 429 retry', () => {
  it('succeeds after 429 retry', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse({ status: 429, body: 'too many' }))
      .mockResolvedValueOnce(mockFetchResponse({ status: 200 }))

    const promise = fetchUrl('http://test.com')
    await vi.runAllTimersAsync()

    const result = await promise
    expect(result.status).toBe(200)
    expect(spy).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('returns 429 after exhausting retries', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockFetchResponse({ status: 429, body: 'too many' }))

    const promise = fetchUrl('http://test.com')
    await vi.runAllTimersAsync()

    const result = await promise
    expect(result.status).toBe(429)
    expect(spy).toHaveBeenCalledTimes(4)
    vi.useRealTimers()
  })

  it('does not retry on non-429 errors', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({ status: 500 })
    )
    const result = await fetchUrl('http://test.com')
    expect(result.status).toBe(500)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('fetchUrl error handling', () => {
  it('throws FetchError on timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    )
    await expect(fetchUrl('http://test.com')).rejects.toThrow(FetchError)
    await expect(fetchUrl('http://test.com')).rejects.toThrow(/timeout/i)
  })

  it('throws FetchError on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND test.com'))
    await expect(fetchUrl('http://test.com')).rejects.toThrow(FetchError)
    await expect(fetchUrl('http://test.com')).rejects.toThrow(/ENOTFOUND/)
  })

  it('uses custom timeout option with AbortController', async () => {
    vi.useFakeTimers()

    vi.spyOn(globalThis, 'fetch').mockImplementation((url, opts) => {
      return new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        })
      })
    })

    const promise = fetchUrl('http://test.com', { timeout: 50 })
    promise.catch(() => {}) // suppress unhandled rejection detection
    await vi.advanceTimersByTimeAsync(50)

    await expect(promise).rejects.toThrow(FetchError)
    await expect(promise).rejects.toThrow(/timeout/i)
    vi.useRealTimers()
  })
})

describe('FetchError', () => {
  it('has name FetchError', () => {
    const err = new FetchError('msg', { status: 500, statusText: 'Error', url: 'http://x.com' })
    expect(err.name).toBe('FetchError')
    expect(err.status).toBe(500)
    expect(err.url).toBe('http://x.com')
  })
})

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

// --------------- appendDeploy ---------------

describe('appendDeploy', () => {
  it('returns URL unchanged when no deploy', () => {
    expect(appendDeploy('http://test.com/feed', undefined)).toBe('http://test.com/feed')
  })

  it('appends ?d=N when URL has no query string', () => {
    expect(appendDeploy('http://test.com/feed', 123)).toBe('http://test.com/feed?d=123')
  })

  it('appends &d=N when URL already has query string', () => {
    expect(appendDeploy('http://test.com/feed?from=0', 456)).toBe('http://test.com/feed?from=0&d=456')
  })

  it('handles deploy=0', () => {
    expect(appendDeploy('http://test.com/feed', 0)).toBe('http://test.com/feed?d=0')
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
    expect(order.sort((a, b) => a - b)).toEqual([1, 2, 3])
  })
})
