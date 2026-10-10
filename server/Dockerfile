# Detection server with Chromium, for any Docker host (Render, Koyeb, Fly, Oracle VM…)
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    PORT=8787

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

# The node image already has user "node" (uid 1000), which is also the uid Hugging Face runs as.
RUN mkdir -p /app/.cache && chown -R node:node /app
USER node

EXPOSE 8787
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
