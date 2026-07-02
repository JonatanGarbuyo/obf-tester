import { fetchUrl } from './http.js';
import { validateXml } from './validators/xml.js';

const DEFAULT_FORBIDDEN_PATTERNS = [
  '    at ',
  'Traceback (most recent call last)',
  'Fatal error',
  'Catchable fatal error',
  '[object Object]',
];

const XML_CONTENT_TYPES = ['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'];

export async function validate(url, options = {}) {
  const {
    expectedContentType,
    forbiddenPatterns = DEFAULT_FORBIDDEN_PATTERNS,
    type,
  } = options;

  const checks = [];

  function pass(check, detail = '') {
    checks.push({ check, passed: true, detail });
  }

  function fail(check, detail = '') {
    checks.push({ check, passed: false, detail });
  }

  // --- Fetch ---
  let response;
  try {
    response = await fetchUrl(url, options);
  } catch (err) {
    fail('fetch', err.message);
    return { url, passed: false, checks };
  }

  const { status, body, contentType } = response;

  // --- Check 1: HTTP status 2xx ---
  if (status >= 200 && status < 300) {
    pass('status', `${status}`);
  } else if (status >= 300 && status < 400) {
    fail('status', `Redirect (${status}) — follow did not resolve`);
  } else {
    fail('status', `${status} ${response.statusText}`);
  }

  // --- Check 2: body not empty ---
  if (body && body.trim().length > 0) {
    pass('body-not-empty', `${body.length} chars`);
  } else {
    fail('body-not-empty', 'body is empty');
  }

  // --- Check 3: content-type ---
  if (expectedContentType) {
    const isExpectedXml = XML_CONTENT_TYPES.includes(expectedContentType);
    const isActualXml = XML_CONTENT_TYPES.includes(contentType);
    const match = contentType === expectedContentType
      || contentType.startsWith(expectedContentType)
      || (isExpectedXml && isActualXml);

    if (match) {
      pass('content-type', contentType);
    } else {
      fail('content-type', `expected "${expectedContentType}", got "${contentType}"`);
    }
  } else {
    pass('content-type', contentType);
  }

  // --- Check 4: forbidden patterns ---
  if (body) {
    for (const pattern of forbiddenPatterns) {
      if (body.includes(pattern)) {
        fail('forbidden-pattern', `response contains "${pattern}"`);
      }
    }
    if (!checks.some(c => c.check === 'forbidden-pattern' && !c.passed)) {
      pass('forbidden-pattern', 'no forbidden patterns found');
    }
  }

  // --- XML checks ---
  const shouldValidateXml = type
    || XML_CONTENT_TYPES.some(ct => contentType.startsWith(ct));

  if (shouldValidateXml && body) {
    const xmlChecks = validateXml(body, { type });
    checks.push(...xmlChecks);
  }

  const passed = checks.every(c => c.passed);

  return { url, passed, checks, body, contentType };
}
