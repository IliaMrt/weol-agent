import fs from 'node:fs';
import { chromium } from 'playwright';
import { config } from './config.js';

export class WeolBrowser {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.queue = Promise.resolve();
    this.keepaliveTimer = null;
  }

  /** Serialize browser actions (одна вкладка). */
  run(task) {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  async start() {
    this.browser = await chromium.launch({
      headless: config.headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const hasState = fs.existsSync(config.storageStatePath);
    this.context = await this.browser.newContext({
      locale: 'ru-RU',
      viewport: { width: 1280, height: 800 },
      ...(hasState ? { storageState: config.storageStatePath } : {}),
    });
    this.page = await this.context.newPage();

    await this.ensureLoggedIn();
    this.startKeepalive();
  }

  async stop() {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
  }

  startKeepalive() {
    const ms = Math.max(2, config.keepaliveMinutes) * 60 * 1000;
    this.keepaliveTimer = setInterval(() => {
      this.run(() => this.keepalive()).catch((err) => {
        console.error('[keepalive]', err.message);
      });
    }, ms);
  }

  async keepalive() {
    console.log('[keepalive] ping /start/');
    await this.page.goto(`${config.baseUrl}/start/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    if (this.page.url().includes('/auth/login')) {
      console.warn('[keepalive] session lost, re-login');
      await this.login();
    } else {
      await this.context.storageState({ path: config.storageStatePath });
    }
  }

  async ensureLoggedIn() {
    await this.page.goto(`${config.baseUrl}/start/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    if (this.page.url().includes('/auth/login')) {
      await this.login();
    } else {
      console.log('[auth] session restored from storage');
      await this.context.storageState({ path: config.storageStatePath });
    }
  }

  async login() {
    console.log('[auth] logging in…');
    await this.page.goto(`${config.baseUrl}/auth/login/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await this.page.fill('#login', config.login);
    await this.page.fill('#password', config.password);
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      this.page.click('button.btn-login'),
    ]);

    if (this.page.url().includes('/auth/login')) {
      const phoneErr = (
        await this.page.locator('.login-error').textContent().catch(() => '')
      )?.trim();
      const passErr = (
        await this.page.locator('.password-error').textContent().catch(() => '')
      )?.trim();
      throw new Error(
        `Login failed. Still on login page. ${phoneErr || passErr || 'Check credentials.'}`,
      );
    }

    await this.context.storageState({ path: config.storageStatePath });
    console.log('[auth] ok →', this.page.url());
  }

  /**
   * Проверка: браузер жив и сессия Bitrix ещё валидна (заход на /start/).
   * При потере сессии пробует перелогиниться.
   */
  async checkStatus() {
    return this.run(async () => {
      const startedAt = Date.now();
      if (!this.page || !this.browser?.isConnected()) {
        return {
          ok: false,
          alive: false,
          session: false,
          error: 'browser not running',
          ms: Date.now() - startedAt,
        };
      }

      await this.page.goto(`${config.baseUrl}/start/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      let session = !this.page.url().includes('/auth/login');
      let relogin = false;

      if (!session) {
        console.warn('[status] session lost, re-login');
        try {
          await this.login();
          await this.page.goto(`${config.baseUrl}/start/`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
          session = !this.page.url().includes('/auth/login');
          relogin = true;
        } catch (err) {
          return {
            ok: false,
            alive: true,
            session: false,
            relogin: false,
            error: err.message || String(err),
            url: this.page.url(),
            ms: Date.now() - startedAt,
          };
        }
      } else {
        await this.context.storageState({ path: config.storageStatePath });
      }

      return {
        ok: session,
        alive: true,
        session,
        relogin,
        url: this.page.url(),
        ms: Date.now() - startedAt,
      };
    });
  }

  /**
   * Открыть устройство: переход по прямой ссылке WEOl.
   * @param {string|number} deviceId
   * @param {string|number} [plot]
   */
  async openDevice(deviceId, plot = config.defaultPlot) {
    return this.run(async () => {
      const url = `${config.baseUrl}/start/?device_id=${encodeURIComponent(deviceId)}&plot=${encodeURIComponent(plot)}`;
      console.log('[open]', url);
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      if (this.page.url().includes('/auth/login')) {
        await this.login();
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }

      // Дать бэкенду обработать open (страница сама дергает устройство).
      await this.page.waitForTimeout(2500);
      await this.context.storageState({ path: config.storageStatePath });

      return {
        ok: true,
        deviceId: String(deviceId),
        plot: String(plot),
        finalUrl: this.page.url(),
      };
    });
  }
}
