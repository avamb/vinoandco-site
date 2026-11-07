#!/bin/sh
# Build the site from the saved builder snapshot into dist/ (staging-like events, no network needed for events).
# usage: SNAP=<path to snapshots/build.json> sh scripts/acceptance/localbuild.sh
EVENTS_SNAPSHOT="$SNAP" SITE_INDEXING=false npm run build
