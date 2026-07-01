#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { validate } from './validate.js';
import { discover } from './discover.js';

function printSingle({ url, passed, checks }) {
  const icon = passed ? '✓' : '✗';
  console.log(`\n${icon} ${url}`);
  console.log(`  Status: ${passed ? 'PASS' : 'FAIL'}\n`);

  for (const c of checks) {
    const mark = c.passed ? '  ✔' : '  ✘';
    console.log(`${mark} ${c.check}: ${c.detail}`);
  }
  console.log('');
}

function parseOptions(args) {
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

  const sourceIndex = args.indexOf('--source');
  if (sourceIndex !== -1 && args[sourceIndex + 1]) {
    options.source = args[sourceIndex + 1];
  }

  const domainIndex = args.indexOf('--domain');
  if (domainIndex !== -1 && args[domainIndex + 1]) {
    options.domain = normalizeUrl(args[domainIndex + 1]);
  }

  return options;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function readSource(source) {
  const content = source === '-' ? await readStdin() : readFileSync(source, 'utf-8');
  const lines = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      lines.push(trimmed);
    }
  }
  return lines;
}

function normalizeUrl(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const isLocal = url.startsWith('localhost') || url.startsWith('127.0.0.1') || url.startsWith('0.0.0.0');
  return `${isLocal ? 'http' : 'https'}://${url}`;
}

function resolveUrl(line, domain) {
  if (line.startsWith('http://') || line.startsWith('https://')) {
    if (domain) {
      const parsed = new URL(line);
      return new URL(parsed.pathname + parsed.search + parsed.hash, domain).href;
    }
    return line;
  }

  if (line.startsWith('/')) {
    if (!domain) {
      throw new Error(`Relative path "${line}" requires --domain`);
    }
    return new URL(line, domain).href;
  }

  throw new Error(`Invalid path: "${line}" — must start with /, http://, or https://`);
}

function printBatchRow(index, total, url, result, duration) {
  const status = result.passed ? 'PASS' : 'FAIL';
  const icon = result.passed ? '✓' : '✗';
  const feedType = result.checks.find(c => c.check === 'xml-root')?.detail?.match(/\((\w+)\)/)?.[1] || '--';

  // find first failing check for details
  const firstFail = result.checks.find(c => !c.passed);
  const detail = firstFail ? `${firstFail.check}: ${firstFail.detail}` : '';

  const summary = result.url;
  console.log(`${icon} ${summary}`);
  if (detail) {
    console.log(`  └ ${detail}`);
  }
}

function printBatchSummary(results) {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\nResult: ${passed}/${total} passed`);
}

async function runBatch(args) {
  const options = parseOptions(args);
  const { source, domain } = options;

  const lines = await readSource(source);
  if (lines.length === 0) {
    console.error(`Source "${source}" is empty`);
    process.exit(1);
  }

  const urls = lines.map(line => resolveUrl(line, domain));
  console.log(`Source: ${source} (${urls.length} routes${domain ? `, domain: ${domain}` : ''})\n`);

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const result = await validate(urls[i], {
      type: options.type,
      expectedContentType: options.expectedContentType,
    });
    results.push(result);
    printBatchRow(i + 1, urls.length, urls[i], result);
  }

  printBatchSummary(results);
  process.exit(results.every(r => r.passed) ? 0 : 1);
}

async function runSingle(args) {
  const url = args[0];

  if (!url || url.startsWith('--')) {
    console.error('Usage: npx obf validate <url> [options]');
    console.error('       npx obf validate --source <file> [--domain <url>]');
    console.error('       npx obf discover <url>');
    console.error('');
    console.error('Options:');
    console.error('  --content-type <type>    Expected Content-Type (e.g. application/xml)');
    console.error('  --type <type>            Feed type: xml, rss, atom, sitemap');
    console.error('  --source <file>          File with routes (one per line), "-" for stdin');
    console.error('  --domain <url>           Base domain for relative routes in source');
    process.exit(1);
  }

  const options = parseOptions(args);
  const result = await validate(normalizeUrl(url), options);
  printSingle(result);
  process.exit(result.passed ? 0 : 1);
}

async function runDiscover(args) {
  const url = args[0];
  if (!url) {
    console.error('Usage: npx obf discover <url>');
    process.exit(1);
  }

  const result = await discover(normalizeUrl(url));

  if (result.sitemaps.length === 0) {
    console.error(`No sitemaps found in ${result.source}${result.error ? ` (${result.error})` : ''}`);
    process.exit(1);
  }

  for (const sm of result.sitemaps) {
    console.log(sm);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'discover') {
    await runDiscover(args.slice(1));
    return;
  }

  if (command !== 'validate') {
    console.error('Usage: npx obf validate <url> [options]');
    console.error('       npx obf validate --source <file> [--domain <url>]');
    console.error('       npx obf discover <url>');
    process.exit(1);
  }

  const rest = args.slice(1);
  const options = parseOptions(rest);

  if (options.source) {
    await runBatch(rest);
  } else {
    await runSingle(rest);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
