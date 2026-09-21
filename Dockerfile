# --- Stage 1: Dependencies / validation source ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# --- Stage 2: Runtime ---
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/migrations ./migrations
COPY --from=builder --chown=node:node /app/schema.sql ./schema.sql

RUN mkdir -p /app/uploads/room-recordings   && chown -R node:node /app/uploads

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3   CMD node -e "fetch('http://localhost:3000/api/v1/ready').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
