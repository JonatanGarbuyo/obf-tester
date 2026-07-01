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

export function extractChildUrls(body) {
  if (!body || (!body.includes('<sitemapindex') && !body.includes('<sitemapindex'))) {
    return []
  }
  const urls = []
  const regex = /<loc>(.*?)<\/loc>/g
  let match
  while ((match = regex.exec(body)) !== null) {
    urls.push(match[1].trim())
  }
  return urls
}

export function isProdUrl(url) {
  try {
    const host = new URL(url).hostname
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0'
  } catch {
    return true
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
