# Next.js standalone container for Azure Container Apps (Debian slim — Prisma-friendly)
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma client + query engine for runtime (dynamic import() isn't traced into standalone)
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
# Floor plans / images persist to a local volume when Azure Blob is not configured
# (self-hosted / droplet). Owned by the runtime user so the file backend can write.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# One-shot DB migrator (has the Prisma CLI + schema). docker-compose runs this once
# before the app starts to create/update the Postgres schema (prisma db push).
FROM build AS migrator
CMD ["npx", "prisma", "db", "push", "--skip-generate"]
