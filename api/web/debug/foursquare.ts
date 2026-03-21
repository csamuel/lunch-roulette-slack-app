import https from 'node:https';

import type { VercelRequest, VercelResponse } from '@vercel/node';

const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY ?? 'YOUR_FOURSQUARE_API_KEY';
const API_VERSION = '1970-01-01' as const;
const REQUEST_TIMEOUT_MS = 8_000;

function buildUrl(near: string): string {
  const searchParams = new URLSearchParams({
    near,
    limit: '1',
  });

  return `https://api.foursquare.com/v3/places/search?${searchParams.toString()}`;
}

async function runHttpsDiagnostic(url: string): Promise<{
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  bodyPreview: string;
}> {
  return await new Promise((resolve, reject) => {
    let settled = false;
    let ended = false;

    const settleResolve = (value: {
      statusCode?: number;
      headers: Record<string, string | string[] | undefined>;
      bodyPreview: string;
    }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const req = https.get(
      url,
      {
        headers: {
          Authorization: FOURSQUARE_API_KEY,
          Accept: 'application/json',
          'X-Places-Api-Version': API_VERSION,
          'User-Agent': 'lunch-roulette-diagnostic/1.0',
          Connection: 'close',
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          ended = true;
          settleResolve({
            statusCode: res.statusCode,
            headers: res.headers,
            bodyPreview: body.slice(0, 500),
          });
        });
        res.on('aborted', () => {
          settleReject(new Error('Diagnostic response aborted'));
        });
        res.on('close', () => {
          if (!ended) {
            settleReject(new Error('Diagnostic response closed before end'));
          }
        });
        res.on('error', settleReject);
      },
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Diagnostic HTTPS request timed out after ${REQUEST_TIMEOUT_MS.toString()}ms`));
    });
    req.on('error', settleReject);
  });
}

async function runFetchDiagnostic(url: string): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  bodyPreview: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Diagnostic fetch request timed out after ${REQUEST_TIMEOUT_MS.toString()}ms`));
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        Accept: 'application/json',
        'X-Places-Api-Version': API_VERSION,
        'User-Agent': 'lunch-roulette-diagnostic/1.0',
      },
    });

    const body = await response.text();
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      bodyPreview: body.slice(0, 500),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const near = typeof req.query.near === 'string' ? req.query.near : '78704';
  const transport = req.query.transport === 'fetch' ? 'fetch' : 'https';
  const url = buildUrl(near);
  const startedAt = Date.now();

  try {
    const result = transport === 'fetch'
      ? await runFetchDiagnostic(url)
      : await runHttpsDiagnostic(url);

    res.status(200).json({
      ok: true,
      transport,
      near,
      url,
      elapsedMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    res.status(500).json({
      ok: false,
      transport,
      near,
      url,
      elapsedMs: Date.now() - startedAt,
      error: message,
    });
  }
};
