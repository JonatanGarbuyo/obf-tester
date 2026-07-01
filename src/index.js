#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { validate } from './validate.js';
import { discover } from './discover.js';

const DEFAULT_DELAY = 300;

// Exported for testing
export { normalizeUrl, resolveUrl, extractChildUrls, isProdUrl, parseOptions, mapConcurrent, readSource, validateAndRecurse }

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

  const mcIndex = args.indexOf('--max-concurrency');
  options.maxConcurrency = mcIndex !== -1 && args[mcIndex + 1] !== undefined ? Number(args[mcIndex + 1]) : 1;

  const delayIndex = args.indexOf('--delay');
  options.delay = delayIndex !== -1 && args[delayIndex + 1] !== undefined ? Number(args[delayIndex + 1]) : undefined;

  const maxPageIndex = args.indexOf('--max-pagination');
  options.maxPagination = maxPageIndex !== -1 && args[maxPageIndex + 1] !== undefined ? Number(args[maxPageIndex + 1]) : 0;

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

async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function printBatchRow(result, indent = 0) {
  const icon = result.passed ? '✓' : '✗';
  const pad = ' '.repeat(indent);
  const detail = extractDetail(result);
  console.log(`${pad}${icon} ${result.url}${detail ? `  ${detail}` : ''}`);
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

async function validateAndRecurse(url, options, domain, delayMs) {
  const result = await validate(url, {
    type: options.type,
    expectedContentType: options.expectedContentType,
  });
  const all = [result];
  printBatchRow(result);

  if (result.body && result.contentType?.includes('xml')) {
    const childUrls = extractChildUrls(result.body);
    if (childUrls.length > 0) {
      const sliced = options.maxPagination > 0 ? childUrls.slice(0, options.maxPagination) : childUrls;
      const childResolved = sliced.map(cu => resolveUrl(cu, domain));
      const childResults = await mapConcurrent(childResolved, options.maxConcurrency ?? 1, async (childUrl) => {
        await sleep(delayMs);
        return validate(childUrl, { type: 'sitemap', expectedContentType: options.expectedContentType });
      });
      for (const child of childResults) {
        all.push(child);
        printBatchRow(child, 2);
      }
    }
  }

  return all;
}

async function runBatch(args) {
  const options = parseOptions(args);
  const { source, domain, recursive, maxConcurrency } = options;
  const delayMs = options.delay ?? DEFAULT_DELAY;

  const lines = await readSource(source);
  if (lines.length === 0) {
    console.error(`Source "${source}" is empty`);
    process.exit(1);
  }

  const urls = lines.map(line => resolveUrl(line, domain));

  if (!domain && urls.some(u => isProdUrl(u))) {
    console.warn('⚠  Warning: validating against production URLs (use --domain to override)\n');
  }

  const mode = recursive ? `, concurrency ${maxConcurrency}, delay ${delayMs}ms` : '';
  console.log(`Source: ${source} (${urls.length} routes${domain ? `, domain: ${domain}` : ''}${mode})\n`);

  const allResults = [];

  for (const url of urls) {
    if (recursive) {
      const results = await validateAndRecurse(url, options, domain, delayMs);
      allResults.push(...results);
    } else {
      const result = await validate(url, {
        type: options.type,
        expectedContentType: options.expectedContentType,
      });
      allResults.push(result);
      printBatchRow(result);
    }

    await sleep(delayMs);
  }

  const passed = allResults.filter(r => r.passed).length;
  printBatchSummary(passed, allResults.length);
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
    console.error('  --max-concurrency <N>    Concurrent requests (default 1)');
    console.error('  --delay <ms>             Delay between requests (default 300)');
    console.error('  --max-pagination <N>     Max children per sitemap-index (0 = all)');
    process.exit(1);
  }

  const options = parseOptions(args);

  if (options.recursive) {
    const domain = options.local && !options.domain ? 'http://localhost' : options.domain;
    const delayMs = options.delay ?? DEFAULT_DELAY;
    const normalizedUrl = normalizeUrl(url);

    if (!domain && isProdUrl(normalizedUrl)) {
      console.warn('⚠  Warning: validating against production URLs (use --domain to override)\n');
    }

    console.log(`Validate: ${normalizedUrl}\n`);

    const allResults = await validateAndRecurse(normalizedUrl, options, domain, delayMs);
    const passed = allResults.filter(r => r.passed).length;
    printBatchSummary(passed, allResults.length);
    process.exit(allResults.every(r => r.passed) ? 0 : 1);
  }

  const result = await validate(normalizeUrl(url), options);
  printSingle(result);
  process.exit(result.passed ? 0 : 1);
}

async function runCheck(args) {
  const url = args[0];
  if (!url || url.startsWith('--')) {
    console.error('Usage: npx obf check <url> [--domain <url>] [--local] [--max-concurrency N] [--delay ms] [--max-pagination N]');
    process.exit(1);
  }

  const options = parseOptions(args);
  const domain = options.local && !options.domain ? 'http://localhost' : options.domain;
  const normalizedUrl = normalizeUrl(url);

  const { sitemaps, source, error, crawlDelay } = await discover(normalizedUrl);
  if (sitemaps.length === 0) {
    console.error(`No sitemaps found in ${source}${error ? ` (${error})` : ''}`);
    process.exit(1);
  }

  const resolved = sitemaps.map(sm => resolveUrl(sm, domain));
  const delayMs = options.delay ?? (crawlDelay ?? DEFAULT_DELAY);

  console.log(`Check: ${normalizedUrl}\n`);

  let info = `${resolved.length} sitemaps`;
  if (crawlDelay) info += `, Crawl-Delay ${crawlDelay}ms`;
  info += `, delay ${delayMs}ms`;
  console.log(`  ${info}\n`);

  if (!domain && resolved.some(u => isProdUrl(u))) {
    console.warn('⚠  Warning: validating against production URLs (use --domain or --local to override)\n');
  }

  const allResults = [];

  for (const rUrl of resolved) {
    const result = await validate(rUrl, {
      type: options.type,
      expectedContentType: options.expectedContentType,
    });
    allResults.push(result);
    printBatchRow(result);

    if (result.body && result.contentType?.includes('xml')) {
      const childUrls = extractChildUrls(result.body);
      if (childUrls.length === 0) continue;

      const sliced = options.maxPagination > 0 ? childUrls.slice(0, options.maxPagination) : childUrls;
      const childResolved = sliced.map(cu => resolveUrl(cu, domain));
      const childResults = await mapConcurrent(childResolved, options.maxConcurrency, async (childUrl) => {
        await sleep(delayMs);
        return validate(childUrl, { type: 'sitemap', expectedContentType: options.expectedContentType });
      });
      for (const child of childResults) {
        allResults.push(child);
        printBatchRow(child, 2);
      }
    }

    await sleep(delayMs);
  }

  const passed = allResults.filter(r => r.passed).length;
  printBatchSummary(passed, allResults.length);
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
    console.error('Usage: npx obf validate <url> [options] [--recursive]');
    console.error('       npx obf validate --source <file> [--domain <url>] [--recursive]');
    console.error('       npx obf discover <url>');
    console.error('       npx obf check <url> [--local] [--max-concurrency N] [--delay ms] [--max-pagination N]');
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

const isMain = !process.env.VITEST;
if (isMain) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
