#!/bin/sh
# Builder mode (SITE_RELEASE_LINK=/srv/site/current): the per-build files
# .nginx/csp-hashes.conf and .nginx/redirects.conf are read when nginx loads its
# config, so after the builder switches the link nginx must reload. This loop
# watches the link and, on every new target, renders the config for it and
# reloads (a config that fails `nginx -t` is not loaded; the old one stays).
link="${SITE_RELEASE_LINK:-}"
[ -n "$link" ] || exit 0
(
  last=""
  while sleep 10; do
    target=$(readlink "$link" 2>/dev/null || true)
    [ -n "$target" ] || continue
    [ "$target" = "$last" ] && continue
    [ -f "$link/.nginx/csp-hashes.conf" ] || continue
    conf=/etc/nginx/conf.d/default.conf
    cp "$conf" "$conf.prev"
    SITE_ROOT="$link" envsubst '${SITE_ROOT} ${ARENA_API_ORIGIN} ${SITE_INDEXING}' \
      < /etc/nginx/templates/default.conf.template > "$conf"
    if nginx -t -q 2>/dev/null; then
      nginx -s reload && echo "watch-release: serving $target" >&2
      last="$target"
    else
      echo "watch-release: config for $target does not load; keeping the previous one" >&2
      cp "$conf.prev" "$conf"
      last="$target"
    fi
  done
) &
