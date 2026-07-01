function extractDetail(result) {
  const firstFail = result.checks.find(c => !c.passed)
  if (firstFail) return `${firstFail.check}: ${firstFail.detail}`
  const statusCheck = result.checks.find(c => c.check === 'status')
  return statusCheck ? `${statusCheck.detail}` : ''
}

export function rowResult(result, indent = 0) {
  const icon = result.passed ? '✓' : '✗'
  const pad = ' '.repeat(indent)
  const detail = extractDetail(result)
  console.log(`${pad}${icon} ${result.url}${detail ? `  ${detail}` : ''}`)
}

export function singleResult({ url, passed, checks }) {
  const icon = passed ? '✓' : '✗'
  console.log(`\n${icon} ${url}`)
  console.log(`  Status: ${passed ? 'PASS' : 'FAIL'}\n`)

  for (const c of checks) {
    const mark = c.passed ? '  ✔' : '  ✘'
    console.log(`${mark} ${c.check}: ${c.detail}`)
  }
  console.log('')
}

export function summary(passed, total) {
  console.log(`\nResult: ${passed}/${total} passed`)
}

export function childCount(n) {
  console.log(`  (${n} children)`)
}

export function sourceInfo(text) {
  console.log(text)
}

export function checkInfo(text) {
  console.log(text)
}

export function validateHeader(url) {
  console.log(`Validate: ${url}\n`)
}

export function warn(text) {
  console.warn(text)
}

export function error(text) {
  console.error(text)
}

export function exit(code) {
  process.exit(code)
}

export function plain(text) {
  console.log(text)
}
