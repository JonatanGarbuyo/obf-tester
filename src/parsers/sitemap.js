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
