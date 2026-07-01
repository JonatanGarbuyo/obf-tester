export function printSingle({ url, passed, checks }) {
  const icon = passed ? '✓' : '✗'
  console.log(`\n${icon} ${url}`)
  console.log(`  Status: ${passed ? 'PASS' : 'FAIL'}\n`)

  for (const c of checks) {
    const mark = c.passed ? '  ✔' : '  ✘'
    console.log(`${mark} ${c.check}: ${c.detail}`)
  }
  console.log('')
}

function extractDetail(result) {
  const firstFail = result.checks.find(c => !c.passed)
  if (firstFail) return `${firstFail.check}: ${firstFail.detail}`
  const statusCheck = result.checks.find(c => c.check === 'status')
  return statusCheck ? `${statusCheck.detail}` : ''
}

export function printBatchRow(result, indent = 0) {
  const icon = result.passed ? '✓' : '✗'
  const pad = ' '.repeat(indent)
  const detail = extractDetail(result)
  console.log(`${pad}${icon} ${result.url}${detail ? `  ${detail}` : ''}`)
}

export function printBatchSummary(passed, total) {
  console.log(`\nResult: ${passed}/${total} passed`)
}
