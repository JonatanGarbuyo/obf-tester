import { validate } from '../validate.js'
import { sleep, normalizeUrl, resolveUrl, isProdUrl, mapConcurrent } from '../http.js'
import { extractChildUrls } from '../parsers/sitemap.js'
import { readSource } from '../source.js'
import * as logger from '../logger.js'

const DEFAULT_DELAY = 300

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
  logger.rowResult(result)

  const isXml = result.contentType?.includes('xml') || result.body?.includes('<sitemapindex')
  if (result.body && isXml) {
    const childUrls = extractChildUrls(result.body)
    if (childUrls.length > 0) {
      const maxPagination = options.maxPagination ?? 0
      const maxConcurrency = options.maxConcurrency ?? 1
      const sliced = maxPagination > 0 ? childUrls.slice(0, maxPagination) : childUrls
      logger.childCount(sliced.length)
      const childResolved = sliced.map(cu => resolveUrl(cu, domain))
      const childResults = await mapConcurrent(childResolved, maxConcurrency, async (childUrl) => {
        await sleep(delayMs)
        return validate(childUrl, { type: 'sitemap' })
      })
      for (const child of childResults) {
        all.push(child)
        logger.rowResult(child, 2)
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
      logger.warn('⚠  Warning: validating against production URLs (use --domain to override)\n')
    }

    logger.validateHeader(normalizedUrl)

    const allResults = await validateAndRecurse(normalizedUrl, argv, domain, delayMs)
    const passed = allResults.filter(r => r.passed).length
    logger.summary(passed, allResults.length)
    logger.exit(allResults.every(r => r.passed) ? 0 : 1)
  }

  const result = await validate(normalizeUrl(url), validateOpts(argv))
  logger.singleResult(result)
  logger.exit(result.passed ? 0 : 1)
}

export async function runBatch(argv) {
  const { source, domain } = argv
  const delayMs = argv.delay ?? DEFAULT_DELAY
  const maxConcurrency = argv.maxConcurrency ?? 1
  const recursive = argv.recursive ?? false

  const lines = await readSource(source)
  if (lines.length === 0) {
    logger.error(`Source "${source}" is empty`)
    logger.exit(1)
  }

  const urls = lines.map(line => resolveUrl(line, domain))

  if (!domain && urls.some(u => isProdUrl(u))) {
    logger.warn('⚠  Warning: validating against production URLs (use --domain to override)\n')
  }

  const mode = recursive ? `, concurrency ${maxConcurrency}, delay ${delayMs}ms` : ''
  logger.sourceInfo(`Source: ${source} (${urls.length} routes${domain ? `, domain: ${domain}` : ''}${mode})\n`)

  const allResults = []

  for (const url of urls) {
    if (recursive) {
      const results = await validateAndRecurse(url, argv, domain, delayMs)
      allResults.push(...results)
    } else {
      const result = await validate(url, validateOpts(argv))
      allResults.push(result)
      logger.rowResult(result)
    }

    if (delayMs > 0) await sleep(delayMs)
  }

  const passed = allResults.filter(r => r.passed).length
  logger.summary(passed, allResults.length)
  logger.exit(allResults.every(r => r.passed) ? 0 : 1)
}
