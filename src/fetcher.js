const DEFAULT_TIMEOUT = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1_000, 2_000, 4_000];
const JITTER_MAX = 500;

export class FetchError extends Error {
  constructor(message, { status, statusText, url } = {}) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

export async function fetchUrl(url, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, headers = {} } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'OBF-tester/0.1',
          ...headers,
        },
        redirect: 'follow',
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        await response.text();
        const delay = RETRY_DELAYS[attempt] + Math.random() * JITTER_MAX;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      const body = await response.text();
      const contentType = response.headers.get('content-type') || '';

      return {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        contentType: contentType.split(';')[0].trim(),
        body,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new FetchError(`Timeout after ${timeout}ms`, { url });
      }
      throw new FetchError(err.message, { url });
    } finally {
      clearTimeout(timer);
    }
  }
}
