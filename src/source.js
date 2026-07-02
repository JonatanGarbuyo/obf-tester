import { readFileSync } from 'node:fs'

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    const chunks = []
    process.stdin.on('data', chunk => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
  })
}

export async function readSource(source) {
  const content = source === '-' ? await readStdin() : readFileSync(source, 'utf-8')
  const lines = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      lines.push(trimmed)
    }
  }
  return lines
}
