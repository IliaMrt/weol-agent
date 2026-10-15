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

## Развёртывание (Docker, рекомендуется)

Chromium внутри образа, `restart: unless-stopped` — сам поднимется после падения/ребута.

На сервере (уже есть клон):

```bash
cd /opt/weol-agent
git pull

cd /opt/weol-agent/agent
# .env уже должен быть; иначе:
# cp .env.example .env && nano .env

mkdir -p data
docker compose up -d --build
docker compose logs -f --tail=50
docker compose ps
ss -tulpn | grep 8787
```

Полезное:

```bash
docker compose restart
docker compose logs -f
docker compose down          # остановить
curl -s "http://127.0.0.1:8787/<PUBLIC_PATH>/status"
```

`data/` монтируется с хоста — сессия Bitrix переживает пересборку контейнера.

## Альтернатива: systemd (без Docker)

См. `systemd/weol-agent.service`. Нужны Node 20+, `npm install`, `npx playwright install chromium`.

## Локально без Docker

```bash
cd agent
cp .env.example .env
npm install && npx playwright install chromium
npm start
```

## Замечания

- Секрет в URL ≈ пароль: не светить в публичных репозиториях и аналитике.
- Одна вкладка Playwright: open-запросы в очереди.
- Не коммитить `.env` и `data/storage.json`.
