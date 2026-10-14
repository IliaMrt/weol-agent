import { config } from './config.js';
import { WeolBrowser } from './weol-browser.js';
import { startHttpServer } from './http-server.js';

const weol = new WeolBrowser();

async function main() {
  console.log('[boot] base=', config.baseUrl, 'headless=', config.headless);
  await weol.start();
  startHttpServer(weol);

  const shutdown = async (signal) => {
    console.log(`[boot] ${signal}, stopping…`);
    await weol.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
