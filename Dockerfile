FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM dependencies AS build
COPY . .
ARG SITE_ORIGIN=https://preprod.5sursync.com
ARG SITE_INDEXABLE=0
ENV SITE_ORIGIN=$SITE_ORIGIN SITE_INDEXABLE=$SITE_INDEXABLE NEXT_TELEMETRY_DISABLED=1
RUN BUILD_MODE=1 NODE_OPTIONS=--max-old-space-size=2048 npm run build && rm -rf .next/standalone/node_modules
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --no-create-home app && mkdir -p /app/storage/private /app/storage/media && chown -R app:app /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# CLI/migrations use source configuration, with no production schema push.
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/package.json /app/tsconfig.json ./
USER app
EXPOSE 3000
CMD ["node","server.js"]
