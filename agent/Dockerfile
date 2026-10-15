# Chromium уже внутри образа Playwright
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    HEADLESS=true \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8787

# gosu — корректный drop privileges после chown тома
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R pwuser:pwuser /app

EXPOSE 8787

# Стартуем от root только чтобы починить права на смонтированный data/,
# затем entrypoint переключается на pwuser.
USER root
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
