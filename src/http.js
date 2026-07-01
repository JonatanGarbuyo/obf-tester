const DEFAULT_TIMEOUT = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1_000, 2_000, 4_000];
const JITTER_MAX = 500;

export class FetchError extends Error {
  constructor(message, { status, statusText, url } = {}) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export function normalizeUrl(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const isLocal = url.startsWith('localhost') || url.startsWith('127.0.0.1') || url.startsWith('0.0.0.0')
  return `${isLocal ? 'http' : 'https'}://${url}`
}

export function resolveUrl(line, domain) {
  if (line.startsWith('http://') || line.startsWith('https://')) {
    if (domain) {
      const parsed = new URL(line)
      return new URL(parsed.pathname + parsed.search + parsed.hash, domain).href
    }
    return line
  }

  if (line.startsWith('/')) {
    if (!domain) {
      throw new Error(`Relative path "${line}" requires --domain`)
    }
    return new URL(line, domain).href
  }

  throw new Error(`Invalid path: "${line}" — must start with /, http://, or https://`)
}

export function isProdUrl(url) {
  try {
    const host = new URL(url).hostname
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0'
  } catch {
    return true
  }
}

export async function fetchUrl(url, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, headers = {} } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'OBF-tester/0.1',
          ...headers,
        },
        redirect: 'follow',
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        await response.text();
        const delay = RETRY_DELAYS[attempt] + Math.random() * JITTER_MAX;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      const body = await response.text();
      const contentType = response.headers.get('content-type') || '';

      return {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        contentType: contentType.split(';')[0].trim(),
        body,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new FetchError(`Timeout after ${timeout}ms`, { url });
      }
      throw new FetchError(err.message, { url });
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
