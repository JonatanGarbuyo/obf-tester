const DEFAULT_TIMEOUT = 15_000;

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
