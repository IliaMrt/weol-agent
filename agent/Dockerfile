# Chromium уже внутри образа Playwright
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    HEADLESS=true \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8787

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

RUN mkdir -p /app/data && chown -R pwuser:pwuser /app

USER pwuser

EXPOSE 8787

CMD ["node", "src/index.js"]
