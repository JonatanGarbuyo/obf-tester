import { discover } from '../discover.js'
import { normalizeUrl } from '../http.js'
import * as logger from '../logger.js'

export async function runDiscover(argv) {
  const url = argv.url
  const result = await discover(normalizeUrl(url))

  if (result.sitemaps.length === 0) {
    logger.error(`No sitemaps found in ${result.source}${result.error ? ` (${result.error})` : ''}`)
    logger.exit(1)
  }

  for (const sm of result.sitemaps) {
    logger.plain(sm)
  }
}
