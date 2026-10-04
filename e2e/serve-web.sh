#!/bin/sh
# Serves the production build of the web app for the smoke tests (#55), the way
# the container image does: the standalone server, with the static assets and
# public files that `next build` leaves outside it copied in beside it.
set -e
cd "$(dirname "$0")/../apps/web"
rm -rf .next/standalone/apps/web/.next/static .next/standalone/apps/web/public
cp -r .next/static .next/standalone/apps/web/.next/static
if [ -d public ]; then cp -r public .next/standalone/apps/web/public; fi
exec node .next/standalone/apps/web/server.js
