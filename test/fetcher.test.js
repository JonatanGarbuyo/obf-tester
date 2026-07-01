import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUrl, FetchError } from '../src/http.js'

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
})

describe('FetchError', () => {
  it('has name FetchError', () => {
    const err = new FetchError('msg', { status: 500, statusText: 'Error', url: 'http://x.com' })
    expect(err.name).toBe('FetchError')
    expect(err.status).toBe(500)
    expect(err.url).toBe('http://x.com')
  })
})
