import { validate } from '../validate.js'
import { discover } from '../parsers/robots.js'
import { sleep, normalizeUrl, resolveUrl, isProdUrl, mapConcurrent, appendDeploy } from '../http.js'
import { extractChildUrls } from '../parsers/sitemap.js'
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

export async function runCheck(argv) {
  const url = argv.url
  const domain = argv.local && !argv.domain ? 'http://localhost' : argv.domain
  const delayMs = argv.delay ?? DEFAULT_DELAY
  const maxPagination = argv.maxPagination ?? 0
  const maxConcurrency = argv.maxConcurrency ?? 1

  const normalizedUrl = normalizeUrl(url)

  const { sitemaps, source, error, crawlDelay } = await discover(normalizedUrl)
  if (sitemaps.length === 0) {
    logger.error(`No sitemaps found in ${source}${error ? ` (${error})` : ''}`)
    logger.exit(1)
  }

  const resolved = sitemaps.map(sm => resolveUrl(sm, domain))
    .map(u => appendDeploy(u, argv.deploy))
  const effectiveDelay = delayMs ?? (crawlDelay ?? DEFAULT_DELAY)

  logger.checkInfo(`Check: ${normalizedUrl}\n`)

  let info = `${resolved.length} sitemaps`
  if (crawlDelay) info += `, Crawl-Delay ${crawlDelay}ms`
  info += `, delay ${effectiveDelay}ms`
  logger.sourceInfo(`  ${info}\n`)

  if (!domain && resolved.some(u => isProdUrl(u))) {
    logger.warn('⚠  Warning: validating against production URLs (use --domain or --local to override)\n')
  }

  const allResults = []

  for (const rUrl of resolved) {
    const result = await validate(rUrl, validateOpts(argv))
    allResults.push(result)
    logger.rowResult(result)

    const isXml = result.contentType?.includes('xml') || result.body?.includes('<sitemapindex')
    if (result.body && isXml) {
      const childUrls = extractChildUrls(result.body)
      if (childUrls.length === 0) continue

      const sliced = maxPagination > 0 ? childUrls.slice(0, maxPagination) : childUrls
      logger.childCount(sliced.length)
      const childResolved = sliced.map(cu => resolveUrl(cu, domain))
        .map(u => appendDeploy(u, argv.deploy))
      const childResults = await mapConcurrent(childResolved, maxConcurrency, async (childUrl) => {
        await sleep(effectiveDelay)
        return validate(childUrl, { type: 'sitemap' })
      })
      for (const child of childResults) {
        allResults.push(child)
        logger.rowResult(child, 2)
      }
    }

    await sleep(effectiveDelay)
  }

  const passed = allResults.filter(r => r.passed).length
  logger.summary(passed, allResults.length)
  logger.exit(allResults.every(r => r.passed) ? 0 : 1)
}
