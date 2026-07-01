#!/usr/bin/env node

import { validate } from './validate.js';

function printResult(result) {
  const icon = result.passed ? '✓' : '✗';
  console.log(`\n${icon} ${result.url}`);
  console.log(`  Status: ${result.passed ? 'PASS' : 'FAIL'}\n`);

  for (const c of result.checks) {
    const mark = c.passed ? '  ✔' : '  ✘';
    console.log(`${mark} ${c.check}: ${c.detail}`);
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'validate') {
    const url = args[1];
    if (!url) {
      console.error('Usage: npm run validate -- <url> [options]');
      console.error('Options:');
      console.error('  --content-type <type>    Expected Content-Type (e.g. application/xml)');
      console.error('  --type <type>            Feed type: xml, rss, atom, sitemap');
      process.exit(1);
    }

    const options = {};
    const ctIndex = args.indexOf('--content-type');
    if (ctIndex !== -1 && args[ctIndex + 1]) {
      options.expectedContentType = args[ctIndex + 1];
    }

    const typeIndex = args.indexOf('--type');
    if (typeIndex !== -1 && args[typeIndex + 1]) {
      options.type = args[typeIndex + 1];
      if (!options.expectedContentType) {
        options.expectedContentType = 'application/xml';
      }
    }

    const result = await validate(url, options);
    printResult(result);
    process.exit(result.passed ? 0 : 1);
  } else {
    console.log('Usage:');
    console.log('  npm run validate -- <url> [--content-type <type>] [--type <type>]');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
