/** Одноразовый тест логина (без HTTP-сервера). */
import { config } from './config.js';
import { WeolBrowser } from './weol-browser.js';

const weol = new WeolBrowser();
await weol.start();
console.log('OK, storage →', config.storageStatePath);
await weol.stop();
