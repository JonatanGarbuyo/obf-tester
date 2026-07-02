import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRunValidate = vi.hoisted(() => vi.fn())
const mockRunBatch = vi.hoisted(() => vi.fn())
const mockRunDiscover = vi.hoisted(() => vi.fn())
const mockRunCheck = vi.hoisted(() => vi.fn())

vi.mock('../src/commands/validate.js', () => ({
  runValidate: mockRunValidate,
  runBatch: mockRunBatch,
}))

vi.mock('../src/commands/discover.js', () => ({
  runDiscover: mockRunDiscover,
}))

vi.mock('../src/commands/check.js', () => ({
  runCheck: mockRunCheck,
}))

import { run } from '../src/cli.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation(() => {})
})

describe('cli routing', () => {
  it('routes validate <url> to runValidate', async () => {
    await run(['validate', 'http://test.com'])

    expect(mockRunValidate).toHaveBeenCalledOnce()
    expect(mockRunValidate).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://test.com' }))
    expect(mockRunBatch).not.toHaveBeenCalled()
  })

  it('routes validate --source to runBatch', async () => {
    await run(['validate', '--source', 'feeds.txt'])

    expect(mockRunBatch).toHaveBeenCalledOnce()
    expect(mockRunBatch).toHaveBeenCalledWith(expect.objectContaining({ source: 'feeds.txt' }))
    expect(mockRunValidate).not.toHaveBeenCalled()
  })

  it('routes bare url to runValidate (default command)', async () => {
    await run(['http://test.com'])

    expect(mockRunValidate).toHaveBeenCalledOnce()
    expect(mockRunValidate).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://test.com' }))
  })

  it('routes discover <url> to runDiscover', async () => {
    await run(['discover', 'http://test.com'])

    expect(mockRunDiscover).toHaveBeenCalledOnce()
    expect(mockRunDiscover).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://test.com' }))
  })

  it('routes check <url> to runCheck', async () => {
    await run(['check', 'http://test.com'])

    expect(mockRunCheck).toHaveBeenCalledOnce()
    expect(mockRunCheck).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://test.com' }))
  })

  it('shows error when no url and no --source', async () => {
    await run(['validate'])

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('url'))
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})
