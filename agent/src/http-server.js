import http from 'node:http';
import { config, publicLinks } from './config.js';
import { OpenRateLimit } from './rate-limit.js';

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

/** Не светим структуру API посторонним. */
function notFound(res) {
  sendJson(res, 404, { ok: false, error: 'not found' });
}

/**
 * @param {import('./weol-browser.js').WeolBrowser} weol
 */
export function startHttpServer(weol) {
  const prefix = `/${config.publicPath}`;
  const limiter = new OpenRateLimit({
    maxPerMinute: config.rateMaxPerMinute,
    lockSeconds: config.rateLockSeconds,
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return notFound(res);
      }

      const url = new URL(req.url || '/', 'http://local');
      const path = url.pathname.replace(/\/+$/, '') || '/';

      // Всё полезное только под секретным префиксом.
      if (!path.startsWith(prefix)) {
        return notFound(res);
      }

      const rest = path.slice(prefix.length) || '/';
      // rest: /in | /out | /35 | /health | /status | /

      // Лёгкая проверка процесса (без похода в WEOl).
      if (rest === '/health') {
        return sendJson(res, 200, {
          ok: true,
          alive: true,
          rate: limiter.status(),
        });
      }

      // Жив ли сервис + актуальна ли сессия Bitrix (реальный запрос на /start/).
      // В rate limit не входит.
      if (rest === '/status') {
        if (req.method === 'HEAD') {
          return sendJson(res, 200, { ok: true });
        }
        const status = await weol.checkStatus();
        return sendJson(res, status.ok ? 200 : 503, {
          ...status,
          rate: limiter.status(),
        });
      }

      if (rest === '/') return notFound(res);

      let deviceId = null;
      if (rest === '/in') deviceId = config.deviceIn;
      else if (rest === '/out') deviceId = config.deviceOut;
      else {
        const m = rest.match(/^\/(\d+)$/);
        if (m) deviceId = m[1];
      }

      if (!deviceId) return notFound(res);

      const gate = limiter.check();
      if (!gate.ok) {
        return sendJson(
          res,
          gate.status,
          {
            ok: false,
            error: gate.error,
            retryAfterSec: gate.retryAfterSec,
          },
          { 'Retry-After': String(gate.retryAfterSec) },
        );
      }

      if (req.method === 'HEAD') {
        return sendJson(res, 200, { ok: true });
      }

      const plot = url.searchParams.get('plot') || config.defaultPlot;
      const result = await weol.openDevice(deviceId, plot);
      return sendJson(res, 200, result);
    } catch (err) {
      console.error('[http]', err);
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
  });

  server.listen(config.httpPort, config.httpHost, () => {
    const links = publicLinks();
    console.log(`[http] listen ${config.httpHost}:${config.httpPort}`);
    console.log(`[http] IN     ${links.in}`);
    console.log(`[http] OUT    ${links.out}`);
    console.log(`[http] STATUS ${links.status}`);
    console.log(
      `[http] rate ≤${config.rateMaxPerMinute}/min, lock ${config.rateLockSeconds}s`,
    );
  });

  return server;
}
