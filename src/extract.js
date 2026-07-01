import { readFileSync } from 'node:fs'

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    const chunks = []
    process.stdin.on('data', chunk => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
  })
}

export async function readSource(source) {
  const content = source === '-' ? await readStdin() : readFileSync(source, 'utf-8')
  const lines = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      lines.push(trimmed)
    }
  }
  return lines
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
