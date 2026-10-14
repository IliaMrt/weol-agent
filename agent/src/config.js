import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(envPath);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

/** Секретный сегмент URL: только [A-Za-z0-9_-], длина ≥ 24. */
function normalizePublicPath(raw) {
  const value = String(raw).replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9_-]{24,}$/.test(value)) {
    throw new Error(
      'PUBLIC_PATH must be ≥24 chars of [A-Za-z0-9_-] (generate: openssl rand -hex 24)',
    );
  }
  return value;
}

export const config = {
  root,
  dataDir: path.join(root, 'data'),
  storageStatePath: path.join(root, 'data', 'storage.json'),
  baseUrl: (process.env.BASE_URL || 'https://app.weol.ru').replace(/\/$/, ''),
  login: required('WEOL_LOGIN'),
  password: required('WEOL_PASSWORD'),
  // наружу по умолчанию
  httpHost: process.env.HTTP_HOST || '0.0.0.0',
  httpPort: Number(process.env.HTTP_PORT || 8787),
  /** База для печати ссылок, напр. https://gates.example.com:8787 */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  publicPath: normalizePublicPath(required('PUBLIC_PATH')),
  defaultPlot: process.env.DEFAULT_PLOT || '500',
  deviceIn: process.env.DEVICE_IN || '35',
  deviceOut: process.env.DEVICE_OUT || '36',
  rateMaxPerMinute: Number(process.env.RATE_MAX_PER_MINUTE || 10),
  rateLockSeconds: Number(process.env.RATE_LOCK_SECONDS || 300),
  keepaliveMinutes: Number(process.env.KEEPALIVE_MINUTES || 8),
  headless: String(process.env.HEADLESS || 'true').toLowerCase() !== 'false',
};

fs.mkdirSync(config.dataDir, { recursive: true });

export function publicLinks() {
  const base =
    config.publicBaseUrl ||
    `http://${config.httpHost === '0.0.0.0' ? '<SERVER_IP>' : config.httpHost}:${config.httpPort}`;
  const rootPath = `${base}/${config.publicPath}`;
  return {
    in: `${rootPath}/in`,
    out: `${rootPath}/out`,
    status: `${rootPath}/status`,
    health: `${rootPath}/health`,
    device: (id) => `${rootPath}/${id}`,
  };
}
