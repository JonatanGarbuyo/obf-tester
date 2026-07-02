import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as logger from '../src/logger.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

// --------------- rowResult ---------------

describe('rowResult', () => {
  it('logs [PASS] with status detail when all checks pass', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.rowResult({ url: 'http://test.com', passed: true, checks: [{ check: 'status', passed: true, detail: '200' }] })
    expect(spy).toHaveBeenCalledWith('[PASS] http://test.com  200')
  })

  it('logs [FAIL] with first failing check detail', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.rowResult({ url: 'http://test.com', passed: false, checks: [
      { check: 'status', passed: true, detail: '200' },
      { check: 'body-not-empty', passed: false, detail: 'body is empty' },
    ]})
    expect(spy).toHaveBeenCalledWith('[FAIL] http://test.com  body-not-empty: body is empty')
  })

  it('respects indent for children', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.rowResult({ url: 'http://test.com', passed: true, checks: [{ check: 'status', passed: true, detail: '200' }] }, 2)
    expect(spy).toHaveBeenCalledWith('  [PASS] http://test.com  200')
  })

  it('logs URL only when detail is empty', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.rowResult({ url: 'http://test.com', passed: true, checks: [{ check: 'foo', passed: true, detail: '' }] })
    expect(spy).toHaveBeenCalledWith('[PASS] http://test.com')
  })
})

// --------------- singleResult ---------------

describe('singleResult', () => {
  it('logs [PASS] header and all checks', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.singleResult({ url: 'http://test.com', passed: true, checks: [
      { check: 'status', passed: true, detail: '200' },
      { check: 'body-not-empty', passed: true, detail: '12 chars' },
    ]})
    expect(spy).toHaveBeenCalledWith('\n[PASS] http://test.com')
    expect(spy).toHaveBeenCalledWith('  Status: PASS\n')
    expect(spy).toHaveBeenCalledWith('  [PASS] status: 200')
    expect(spy).toHaveBeenCalledWith('  [PASS] body-not-empty: 12 chars')
  })

  it('shows [FAIL] for failed checks', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.singleResult({ url: 'http://test.com', passed: false, checks: [
      { check: 'status', passed: false, detail: '500 Internal Error' },
    ]})
    expect(spy).toHaveBeenCalledWith('\n[FAIL] http://test.com')
    expect(spy).toHaveBeenCalledWith('  Status: FAIL\n')
    expect(spy).toHaveBeenCalledWith('  [FAIL] status: 500 Internal Error')
  })
})

// --------------- summary ---------------

describe('summary', () => {
  it('logs passed/total', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.summary(3, 5)
    expect(spy).toHaveBeenCalledWith('\nResult: 3/5 passed')
  })

  it('logs 0/0 when no results', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.summary(0, 0)
    expect(spy).toHaveBeenCalledWith('\nResult: 0/0 passed')
  })
})

// --------------- childCount ---------------

describe('childCount', () => {
  it('logs (N children) with indent', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.childCount(3)
    expect(spy).toHaveBeenCalledWith('  (3 children)')
  })

  it('logs (0 children)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.childCount(0)
    expect(spy).toHaveBeenCalledWith('  (0 children)')
  })
})

// --------------- failureReport ---------------

describe('failureReport', () => {
  it('logs nothing when no failures', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.failureReport([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('logs Failed: header and each failure', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const failed = [
      { url: 'http://test.com/feed1', passed: false, checks: [{ check: 'status', passed: false, detail: '404' }] },
      { url: 'http://test.com/feed2', passed: false, checks: [{ check: 'body-not-empty', passed: false, detail: 'body is empty' }] },
    ]
    logger.failureReport(failed)
    expect(spy).toHaveBeenCalledWith('\nFailed:')
    expect(spy).toHaveBeenCalledWith('  [FAIL] http://test.com/feed1  status: 404')
    expect(spy).toHaveBeenCalledWith('  [FAIL] http://test.com/feed2  body-not-empty: body is empty')
  })

  it('shows detail from first failing check', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const failed = [{
      url: 'http://test.com/feed',
      passed: false,
      checks: [
        { check: 'status', passed: true, detail: '200' },
        { check: 'forbidden-pattern', passed: false, detail: 'response contains "Fatal error"' },
      ],
    }]
    logger.failureReport(failed)
    expect(spy).toHaveBeenCalledWith('  [FAIL] http://test.com/feed  forbidden-pattern: response contains "Fatal error"')
  })
})

// --------------- exit ---------------

describe('exit', () => {
  it('calls process.exit with given code', () => {
    const spy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    logger.exit(0)
    expect(spy).toHaveBeenCalledWith(0)
  })

  it('calls process.exit with 1', () => {
    const spy = vi.spyOn(process, 'exit').mockImplementation(() => {})
    logger.exit(1)
    expect(spy).toHaveBeenCalledWith(1)
  })
})

// --------------- warn / error / plain ---------------

describe('warn', () => {
  it('logs via console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('something fishy')
    expect(spy).toHaveBeenCalledWith('something fishy')
  })
})

describe('error', () => {
  it('logs via console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('something broke')
    expect(spy).toHaveBeenCalledWith('something broke')
  })
})

describe('plain', () => {
  it('logs via console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.plain('just a line')
    expect(spy).toHaveBeenCalledWith('just a line')
  })
})

// --------------- sourceInfo / checkInfo / validateHeader ---------------

describe('sourceInfo', () => {
  it('logs text via console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.sourceInfo('Source: feeds.txt (5 routes)')
    expect(spy).toHaveBeenCalledWith('Source: feeds.txt (5 routes)')
  })
})

describe('checkInfo', () => {
  it('logs text via console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.checkInfo('Check: https://example.com')
    expect(spy).toHaveBeenCalledWith('Check: https://example.com')
  })
})

describe('validateHeader', () => {
  it('logs Validate: url with blank line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.validateHeader('https://example.com/sitemap')
    expect(spy).toHaveBeenCalledWith('Validate: https://example.com/sitemap\n')
  })
})
