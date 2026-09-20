#!/usr/bin/env bash
# Local helper: serve the production standalone build the way the container does.
# (`next start` refuses to run an output: 'standalone' build.)
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import os, signal
for pid in filter(str.isdigit, os.listdir('/proc')):
    try:
        cmd = ' '.join(open(f'/proc/{pid}/cmdline','rb').read().decode().split('\x00'))
        exe = os.readlink(f'/proc/{pid}/exe')
    except Exception:
        continue
    if 'node' in exe and ('next-server' in cmd or 'standalone' in cmd):
        os.kill(int(pid), signal.SIGKILL)
PY
sleep 1
cp -r public .next/standalone/apps/web/public 2>/dev/null || true
rm -rf .next/standalone/apps/web/.next/static
cp -r .next/static .next/standalone/apps/web/.next/static
PORT="${PORT:-3000}" HOSTNAME=0.0.0.0 nohup node --env-file-if-exists=.env \
  .next/standalone/apps/web/server.js > /tmp/web.log 2>&1 &
until curl -sf -m 3 "localhost:${PORT:-3000}/healthz" >/dev/null; do sleep 1; done
echo "web up on ${PORT:-3000}"
