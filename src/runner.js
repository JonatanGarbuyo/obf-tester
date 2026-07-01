import { readFileSync } from 'node:fs'
import { validate } from './validate.js'
import { discover } from './discover.js'
import {
  sleep,
  normalizeUrl,
  resolveUrl,
  extractChildUrls,
  isProdUrl,
  mapConcurrent,
} from './utils.js'
import { printSingle, printBatchRow, printBatchSummary } from './format.js'

const DEFAULT_DELAY = 300

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

function validateOpts(argv) {
  const opts = {}
  if (argv.type) {
    opts.type = argv.type
    opts.expectedContentType = 'application/xml'
  }
  if (argv.contentType) opts.expectedContentType = argv.contentType
  return opts
}

export async function validateAndRecurse(url, options, domain, delayMs) {
  const result = await validate(url, validateOpts(options))
  const all = [result]
  printBatchRow(result)

  const isXml = result.contentType?.includes('xml') || result.body?.includes('<sitemapindex')
  if (result.body && isXml) {
    const childUrls = extractChildUrls(result.body)
    if (childUrls.length > 0) {
      const maxPagination = options.maxPagination ?? 0
      const maxConcurrency = options.maxConcurrency ?? 1
      const sliced = maxPagination > 0 ? childUrls.slice(0, maxPagination) : childUrls
      console.log(`  (${sliced.length} children)`)
      const childResolved = sliced.map(cu => resolveUrl(cu, domain))
      const childResults = await mapConcurrent(childResolved, maxConcurrency, async (childUrl) => {
        await sleep(delayMs)
        return validate(childUrl, { type: 'sitemap' })
      })
      for (const child of childResults) {
        all.push(child)
        printBatchRow(child, 2)
      }
    }
  }

  return all
}

export async function runValidate(argv) {
  const url = argv.url
  const domain = argv.local && !argv.domain ? 'http://localhost' : argv.domain

  if (argv.recursive) {
    const delayMs = argv.delay ?? DEFAULT_DELAY
    const normalizedUrl = normalizeUrl(url)

    if (!domain && isProdUrl(normalizedUrl)) {
      console.warn('⚠  Warning: validating against production URLs (use --domain to override)\n')
    }

    console.log(`Validate: ${normalizedUrl}\n`)

    const allResults = await validateAndRecurse(normalizedUrl, argv, domain, delayMs)
    const passed = allResults.filter(r => r.passed).length
    printBatchSummary(passed, allResults.length)
    process.exit(allResults.every(r => r.passed) ? 0 : 1)
  }

  const result = await validate(normalizeUrl(url), validateOpts(argv))
  printSingle(result)
  process.exit(result.passed ? 0 : 1)
}

export async function runBatch(argv) {
  const { source, domain } = argv
  const delayMs = argv.delay ?? DEFAULT_DELAY
  const maxConcurrency = argv.maxConcurrency ?? 1
  const recursive = argv.recursive ?? false

  const lines = await readSource(source)
  if (lines.length === 0) {
    console.error(`Source "${source}" is empty`)
    process.exit(1)
  }

  const urls = lines.map(line => resolveUrl(line, domain))

  if (!domain && urls.some(u => isProdUrl(u))) {
    console.warn('⚠  Warning: validating against production URLs (use --domain to override)\n')
  }

  const mode = recursive ? `, concurrency ${maxConcurrency}, delay ${delayMs}ms` : ''
  console.log(`Source: ${source} (${urls.length} routes${domain ? `, domain: ${domain}` : ''}${mode})\n`)

  const allResults = []

  for (const url of urls) {
    if (recursive) {
      const results = await validateAndRecurse(url, argv, domain, delayMs)
      allResults.push(...results)
    } else {
      const result = await validate(url, validateOpts(argv))
      allResults.push(result)
      printBatchRow(result)
    }

    if (delayMs > 0) await sleep(delayMs)
  }

  const passed = allResults.filter(r => r.passed).length
  printBatchSummary(passed, allResults.length)
  process.exit(allResults.every(r => r.passed) ? 0 : 1)
}

export async function runCheck(argv) {
  const url = argv.url
  const domain = argv.local && !argv.domain ? 'http://localhost' : argv.domain
  const delayMs = argv.delay ?? DEFAULT_DELAY
  const maxPagination = argv.maxPagination ?? 0
  const maxConcurrency = argv.maxConcurrency ?? 1

  const normalizedUrl = normalizeUrl(url)

  const { sitemaps, source, error, crawlDelay } = await discover(normalizedUrl)
  if (sitemaps.length === 0) {
    console.error(`No sitemaps found in ${source}${error ? ` (${error})` : ''}`)
    process.exit(1)
  }

  const resolved = sitemaps.map(sm => resolveUrl(sm, domain))
  const effectiveDelay = delayMs ?? (crawlDelay ?? DEFAULT_DELAY)

  console.log(`Check: ${normalizedUrl}\n`)

  let info = `${resolved.length} sitemaps`
  if (crawlDelay) info += `, Crawl-Delay ${crawlDelay}ms`
  info += `, delay ${effectiveDelay}ms`
  console.log(`  ${info}\n`)

  if (!domain && resolved.some(u => isProdUrl(u))) {
    console.warn('⚠  Warning: validating against production URLs (use --domain or --local to override)\n')
  }

  const allResults = []

  for (const rUrl of resolved) {
    const result = await validate(rUrl, validateOpts(argv))
    allResults.push(result)
    printBatchRow(result)

    const isXml = result.contentType?.includes('xml') || result.body?.includes('<sitemapindex')
    if (result.body && isXml) {
      const childUrls = extractChildUrls(result.body)
      if (childUrls.length === 0) continue

      const sliced = maxPagination > 0 ? childUrls.slice(0, maxPagination) : childUrls
      console.log(`  (${sliced.length} children)`)
      const childResolved = sliced.map(cu => resolveUrl(cu, domain))
      const childResults = await mapConcurrent(childResolved, maxConcurrency, async (childUrl) => {
        await sleep(effectiveDelay)
        return validate(childUrl, { type: 'sitemap' })
      })
      for (const child of childResults) {
        allResults.push(child)
        printBatchRow(child, 2)
      }
    }

    await sleep(effectiveDelay)
  }

  const passed = allResults.filter(r => r.passed).length
  printBatchSummary(passed, allResults.length)
  process.exit(allResults.every(r => r.passed) ? 0 : 1)
}

export async function runDiscover(argv) {
  const url = argv.url
  const result = await discover(normalizeUrl(url))

  if (result.sitemaps.length === 0) {
    console.error(`No sitemaps found in ${result.source}${result.error ? ` (${result.error})` : ''}`)
    process.exit(1)
  }

  for (const sm of result.sitemaps) {
    console.log(sm)
  }
}
