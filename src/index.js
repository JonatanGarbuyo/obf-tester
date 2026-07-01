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

  options.recursive = args.includes('--recursive');
  options.local = args.includes('--local');

  const maxIndex = args.indexOf('--max');
  options.max = maxIndex !== -1 && args[maxIndex + 1] !== undefined ? Number(args[maxIndex + 1]) : 3;

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

function extractDetail(result) {
  const firstFail = result.checks.find(c => !c.passed);
  if (firstFail) return `${firstFail.check}: ${firstFail.detail}`;
  const statusCheck = result.checks.find(c => c.check === 'status');
  return statusCheck ? `${statusCheck.detail}` : '';
}

function extractChildUrls(body) {
  if (!body || (!body.includes('<sitemapindex') && !body.includes('<sitemapindex'))) {
    return [];
  }
  const urls = [];
  const regex = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

function printBatchRow(result, indent = 0) {
  const icon = result.passed ? '✓' : '✗';
  const pad = ' '.repeat(indent);
  const detail = extractDetail(result);
  const label = result.passed && indent > 0
    ? new URL(result.url).search || new URL(result.url).pathname.split('/').pop()
    : result.url;
  console.log(`${pad}${icon} ${label}${detail ? `  ${detail}` : ''}`);
}

function isProdUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0';
  } catch {
    return true;
  }
}

function printBatchSummary(passed, total) {
  console.log(`\nResult: ${passed}/${total} passed`);
}

async function runBatch(args) {
  const options = parseOptions(args);
  const { source, domain, recursive } = options;

  const lines = await readSource(source);
  if (lines.length === 0) {
    console.error(`Source "${source}" is empty`);
    process.exit(1);
  }

  const urls = lines.map(line => resolveUrl(line, domain));

  if (!domain && urls.some(u => isProdUrl(u))) {
    console.warn('⚠  Warning: validating against production URLs (use --domain to override)\n');
  }

  const mode = recursive ? ', recursive' : '';
  console.log(`Source: ${source} (${urls.length} routes${domain ? `, domain: ${domain}` : ''}${mode})\n`);

  const allResults = [];
  let passed = 0;
  let total = 0;

  for (const url of urls) {
    const result = await validate(url, {
      type: options.type,
      expectedContentType: options.expectedContentType,
    });
    allResults.push(result);
    total++;
    if (result.passed) passed++;
    printBatchRow(result);

    if (recursive && result.body && result.contentType && result.contentType.includes('xml')) {
      const childUrls = extractChildUrls(result.body);
      const max = options.max === 0 ? childUrls.length : options.max;
      for (let i = 0; i < Math.min(childUrls.length, max); i++) {
        const childResolved = resolveUrl(childUrls[i], domain);
        const child = await validate(childResolved, {
          type: 'sitemap',
          expectedContentType: options.expectedContentType,
        });
        allResults.push(child);
        total++;
        if (child.passed) passed++;
        printBatchRow(child, 2);
      }
      if (childUrls.length > max) {
        console.log(`  ... and ${childUrls.length - max} more (use --max 0 to see all)`);
      }
    }
  }

  printBatchSummary(passed, total);
  process.exit(allResults.every(r => r.passed) ? 0 : 1);
}

async function runSingle(args) {
  const url = args[0];

  if (!url || url.startsWith('--')) {
    console.error('Usage: npx obf validate <url> [options]');
    console.error('       npx obf validate --source <file> [--domain <url>] [--recursive]');
    console.error('       npx obf discover <url>');
    console.error('       npx obf check <url> [--local]');
    console.error('');
    console.error('Options:');
    console.error('  --content-type <type>    Expected Content-Type (e.g. application/xml)');
    console.error('  --type <type>            Feed type: xml, rss, atom, sitemap');
    console.error('  --source <file>          File with routes (one per line), "-" for stdin');
    console.error('  --domain <url>           Base domain for relative routes in source');
    console.error('  --recursive              Follow sitemap-index children');
    console.error('  --local                  Shorthand for --domain http://localhost');
    console.error('  --max <number>           Max recursive children (default 3, 0 = all)');
    process.exit(1);
  }

  const options = parseOptions(args);
  const result = await validate(normalizeUrl(url), options);
  printSingle(result);
  process.exit(result.passed ? 0 : 1);
}

async function runCheck(args) {
  const url = args[0];
  if (!url || url.startsWith('--')) {
    console.error('Usage: npx obf check <url> [--domain <url>] [--local] [--max N]');
    process.exit(1);
  }

  const options = parseOptions(args);
  const domain = options.local && !options.domain ? 'http://localhost' : options.domain;
  const normalizedUrl = normalizeUrl(url);

  const { sitemaps, source, error } = await discover(normalizedUrl);
  if (sitemaps.length === 0) {
    console.error(`No sitemaps found in ${source}${error ? ` (${error})` : ''}`);
    process.exit(1);
  }

  const resolved = sitemaps.map(sm => resolveUrl(sm, domain));

  console.log(`Check: ${normalizedUrl}\n`);

  if (!domain && resolved.some(u => isProdUrl(u))) {
    console.warn('⚠  Warning: validating against production URLs (use --domain or --local to override)\n');
  }

  const allResults = [];
  let passed = 0;
  let total = 0;

  for (const rUrl of resolved) {
    const result = await validate(rUrl, {
      type: options.type,
      expectedContentType: options.expectedContentType,
    });
    allResults.push(result);
    total++;
    if (result.passed) passed++;
    printBatchRow(result);

    if (result.body && result.contentType?.includes('xml')) {
      const childUrls = extractChildUrls(result.body);
      const max = options.max === 0 ? childUrls.length : options.max;
      for (let i = 0; i < Math.min(childUrls.length, max); i++) {
        const childResolved = resolveUrl(childUrls[i], domain);
        const child = await validate(childResolved, {
          type: 'sitemap',
          expectedContentType: options.expectedContentType,
        });
        allResults.push(child);
        total++;
        if (child.passed) passed++;
        printBatchRow(child, 2);
      }
      if (childUrls.length > max) {
        console.log(`  ... and ${childUrls.length - max} more (use --max 0 to see all)`);
      }
    }
  }

  printBatchSummary(passed, total);
  process.exit(allResults.every(r => r.passed) ? 0 : 1);
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

  if (command === 'check') {
    await runCheck(args.slice(1));
    return;
  }

  if (command !== 'validate') {
    console.error('Usage: npx obf validate <url> [options]');
    console.error('       npx obf validate --source <file> [--domain <url>] [--recursive]');
    console.error('       npx obf discover <url>');
    console.error('       npx obf check <url> [--local] [--max N]');
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
