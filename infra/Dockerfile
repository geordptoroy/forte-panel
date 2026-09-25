FROM node:22-slim AS builder

WORKDIR /app
COPY . .
RUN npm install -g corepack@latest \
  && corepack enable \
  && corepack pnpm install --frozen-lockfile \
  && corepack pnpm run build

FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle-pg ./drizzle-pg
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY infra/docker-entrypoint.sh ./docker-entrypoint.sh

RUN npm install -g corepack@latest \
  && corepack enable \
  && chmod +x ./docker-entrypoint.sh \
  && groupadd --system --gid 10001 forte \
  && useradd --system --uid 10001 --gid 10001 --home-dir /app --no-create-home forte \
  && chown -R forte:forte /app

EXPOSE 3000
USER forte
CMD ["./docker-entrypoint.sh"]
