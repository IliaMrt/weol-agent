# WEOl agent (Playwright)

Headless Chromium: логин в `app.weol.ru`, keepalive сессии, открытие КПП по **прямым публичным ссылкам** с длинным секретным путём.

## Публичные ссылки

Секрет задаётся в `PUBLIC_PATH` (≥24 символа). Наружу торчат только такие URL:

| Ссылка | Действие |
|--------|----------|
| `http://SERVER:8787/<PUBLIC_PATH>/in` | device 35 («В Орбиту») |
| `http://SERVER:8787/<PUBLIC_PATH>/out` | device 36 («Из Орбиты») |
| `http://SERVER:8787/<PUBLIC_PATH>/35` | любой device_id |
| `http://SERVER:8787/<PUBLIC_PATH>/status` | тест: сервис жив + сессия Bitrix актуальна |
| `http://SERVER:8787/<PUBLIC_PATH>/health` | лёгкий ping процесса (без проверки WEOl) |

Любой другой путь (включая `/`) → `404` без подсказок.

Сгенерировать секрет:

```bash
openssl rand -hex 24
```

Пример: `http://203.0.113.10:8787/a1b2c3…f0/in`

## `/status`

Реально открывает `app.weol.ru/start/` в headless-браузере.

- `200` + `"session": true` — всё ок  
- `503` + `"session": false` — сессия мертва / логин не удался  
- если сессия протухла — пробует перелогиниться (`"relogin": true`)  
- в rate limit **не** входит  

Пример ответа:

```json
{
  "ok": true,
  "alive": true,
  "session": true,
  "relogin": false,
  "url": "https://app.weol.ru/start/",
  "ms": 842,
  "rate": { "hitsLastMinute": 0, "maxPerMinute": 10, "locked": false }
}
```

## Rate limit

- Считаются **оба** open-эндпойнта вместе (`/in`, `/out`, `/NN`).
- Больше `RATE_MAX_PER_MINUTE` (по умолчанию **10**) за скользящую минуту → **оба** блокируются на `RATE_LOCK_SECONDS` (по умолчанию **300** с).
- Ответ: `429` + `Retry-After`.
- `/status` и `/health` лимит не трогают.

## Развёртывание на Ubuntu / Debian

### 1. Node 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Каталог

```bash
sudo useradd --system --create-home --home-dir /opt/weol-agent --shell /usr/sbin/nologin weol
sudo rsync -a ./agent/ /opt/weol-agent/
sudo chown -R weol:weol /opt/weol-agent
```

### 3. npm + Chromium

```bash
cd /opt/weol-agent
sudo -u weol npm install
sudo npx playwright install-deps chromium
sudo -u weol npx playwright install chromium
```

### 4. `.env`

```bash
sudo -u weol cp .env.example .env
sudo -u weol nano .env
```

Обязательно:

- `WEOL_LOGIN` / `WEOL_PASSWORD`
- `PUBLIC_PATH=$(openssl rand -hex 24)` — сохранить ссылки в парольный менеджер
- `PUBLIC_BASE_URL=http://ВАШ_IP:8787`
- `HTTP_HOST=0.0.0.0`

### 5. Файрвол

```bash
sudo ufw allow 8787/tcp
# или только со своего IP:
# sudo ufw allow from YOUR.IP.ADDR to any port 8787
```

### 6. Проверка и systemd

```bash
sudo -u weol npm run login-test
sudo cp systemd/weol-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now weol-agent
journalctl -u weol-agent -n 30
```

В логе будут полные ссылки `IN` / `OUT`.

### 7. Вызов с телефона / закладки

Открыть в браузере сохранённую ссылку `/…/in` или `/…/out`.  
Ответ JSON `{"ok":true,...}` — команда ушла в WEOl.

## Локально

```bash
cd agent
cp .env.example .env   # логин, пароль, PUBLIC_PATH
npm install && npx playwright install chromium
npm start
```

## Замечания

- Секрет в URL ≈ пароль: не светить в публичных репозиториях и аналитике.
- Одна вкладка Playwright: open-запросы в очереди.
- Не коммитить `.env` и `data/storage.json`.
