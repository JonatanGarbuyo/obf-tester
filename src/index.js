#!/usr/bin/env node

import { run } from './cli.js'

const isMain = !process.env.VITEST
if (isMain) {
  run(process.argv.slice(2)).catch(err => {
    console.error('Fatal:', err.message)
    process.exit(1)
  })
}
