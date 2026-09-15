# Build from repository root: docker compose build api  (context: .)
FROM node:22-alpine AS build

WORKDIR /app

COPY api/package*.json ./
RUN npm ci

COPY api/prisma ./prisma
RUN npx prisma generate

COPY api/ ./
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL=file:/data/dev.db

RUN mkdir -p /data /data/uploads /app/catalog

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts

COPY snifer/output/*.json /app/catalog/

COPY api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/docker-entrypoint.sh"]
