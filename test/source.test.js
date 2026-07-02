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

  it('throws when file does not exist', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })
    await expect(readSource('./nonexistent.txt')).rejects.toThrow(/ENOENT/)
  })

  it('reads from stdin when source is "-"', async () => {
    const originalIsTTY = process.stdin.isTTY
    const originalOn = process.stdin.on

    const chunks = []
    process.stdin.isTTY = false
    process.stdin.on = (event, cb) => {
      if (event === 'data') chunks.push(cb)
      if (event === 'end') {
        chunks.forEach(cb => cb(Buffer.from('/stdin/path1\n# comment\n/stdin/path2\n')))
        cb()
      }
      return process.stdin
    }

    const lines = await readSource('-')
    expect(lines).toEqual(['/stdin/path1', '/stdin/path2'])

    process.stdin.isTTY = originalIsTTY
    process.stdin.on = originalOn
  })
})
