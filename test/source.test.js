import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReadFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}))

import { readSource } from '../src/source.js'

describe('readSource', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
  })

  it('skips comments and empty lines', async () => {
    mockReadFileSync.mockReturnValue(
      '# this is a comment\n/valid/path\n\n# another comment\n/second/path\n'
    )
    const lines = await readSource('./test.txt')
    expect(lines).toEqual(['/valid/path', '/second/path'])
  })

  it('trims whitespace from lines', async () => {
    mockReadFileSync.mockReturnValue('  /path/1  \n  /path/2  \n')
    const lines = await readSource('./test.txt')
    expect(lines).toEqual(['/path/1', '/path/2'])
  })
})
