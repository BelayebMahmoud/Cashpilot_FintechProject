# CashPilot — production image (Next.js standalone output).
# Migrations are a separate step:  docker run --rm --env-file .env <image> migrate
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@cashpilot/web

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# standalone server + static assets
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
# migrations (run with the "migrate" command below)
COPY --from=build --chown=app:app /app/packages/db/prisma ./packages/db/prisma
COPY --from=build --chown=app:app /app/packages/db/prisma.config.ts ./packages/db/prisma.config.ts
COPY --from=build /app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/storage && chown app:app /app/storage
USER app
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["serve"]
