# Static site image: build with Node, serve with nginx.
# Build args are PUBLIC values only (see .env.example).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG SITE_URL=https://vinoandco.events
ARG SITE_INDEXING=false
ARG PUBLIC_ARENA_API=https://api.arenasoldout.com
ARG PUBLIC_FEED_TOKEN=
ARG PUBLIC_META_PIXEL_ID=
ARG PUBLIC_GA4_ID=
ARG EVENTS_SNAPSHOT=
ENV SITE_URL=$SITE_URL SITE_INDEXING=$SITE_INDEXING PUBLIC_ARENA_API=$PUBLIC_ARENA_API \
    PUBLIC_FEED_TOKEN=$PUBLIC_FEED_TOKEN PUBLIC_META_PIXEL_ID=$PUBLIC_META_PIXEL_ID \
    PUBLIC_GA4_ID=$PUBLIC_GA4_ID EVENTS_SNAPSHOT=$EVENTS_SNAPSHOT
RUN npm run build

FROM nginx:1.27-alpine AS web
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/headers.conf nginx/headers-personal.conf /etc/nginx/snippets/
COPY --from=build /app/dist /usr/share/nginx/html
ENV ARENA_API_ORIGIN=https://api.arenasoldout.com SITE_INDEXING=false
EXPOSE 80
