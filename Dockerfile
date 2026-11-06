# Static site image: build with Node, serve with nginx. A second target runs
# the builder (spec 62 §9), which rebuilds the site from the platform feed and
# switches the folder nginx serves.
# Build args are PUBLIC values only (see .env.example).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ARG SITE_URL=https://vinoandco.events
ARG SITE_INDEXING=false
ARG PUBLIC_ARENA_API=https://api.arenasoldout.com
ARG PUBLIC_FEED_TOKEN=
ARG PUBLIC_META_PIXEL_ID=
ARG PUBLIC_GA4_ID=
ARG PUBLIC_TURNSTILE_SITE_KEY=
ARG EVENTS_SNAPSHOT=
ENV SITE_URL=$SITE_URL SITE_INDEXING=$SITE_INDEXING PUBLIC_ARENA_API=$PUBLIC_ARENA_API \
    PUBLIC_FEED_TOKEN=$PUBLIC_FEED_TOKEN PUBLIC_META_PIXEL_ID=$PUBLIC_META_PIXEL_ID \
    PUBLIC_GA4_ID=$PUBLIC_GA4_ID PUBLIC_TURNSTILE_SITE_KEY=$PUBLIC_TURNSTILE_SITE_KEY EVENTS_SNAPSHOT=$EVENTS_SNAPSHOT
RUN npm run build

# Builder: polls the feed, builds into /site/releases/<time>, checks, switches
# /site/current. Volumes: /data (builder-data), /site (shared with web).
FROM deps AS builder
COPY . .
ENV BUILDER_APP_DIR=/app BUILDER_DATA_DIR=/data BUILDER_SITE_DIR=/site BUILDER_HEALTH_PORT=8081
EXPOSE 8081
HEALTHCHECK --interval=60s --timeout=5s --start-period=5m CMD wget -qO- http://127.0.0.1:8081/healthz >/dev/null || exit 1
CMD ["node", "--experimental-strip-types", "builder/run.mjs"]

FROM nginx:1.27-alpine AS web
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/headers.conf nginx/headers-personal.conf /etc/nginx/snippets/
COPY nginx/15-site-root.envsh nginx/40-watch-release.sh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/15-site-root.envsh /docker-entrypoint.d/40-watch-release.sh
COPY --from=build /app/dist /usr/share/nginx/html
# SITE_ROOT: the folder nginx serves. With the builder it is /srv/site/current
# (docker-compose.yml); without one, or before its first publish, this image's own build.
ENV ARENA_API_ORIGIN=https://api.arenasoldout.com SITE_INDEXING=false SITE_ROOT=/usr/share/nginx/html
EXPOSE 80
