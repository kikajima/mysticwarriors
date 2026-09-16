#!/bin/bash
# Sobe o servidor de PRODUÇÃO SIMULADA (pacote standalone) como daemon
# com duplo-fork (re-parent para init) — sobrevive ao fim do comando.
set -e
cd /tmp/prod-sim
. ./beacon.env
export GM_DATA_DIR=/tmp/prod-sim-data
export DATABASE_URL="file:/tmp/prod-sim-data/custom.db"
export GM_SEED_DB=/tmp/prod-sim/db/custom.db
export GM_MIGRATIONS_DIR=/tmp/prod-sim/next-service-dist/prisma/migrations
export PORT=3111
export HOSTNAME=127.0.0.1
export NODE_ENV=production

python3 - <<'EOF'
import os, sys
if os.fork() > 0:
    sys.exit(0)
os.setsid()
if os.fork() > 0:
    sys.exit(0)
log = open('/tmp/prod-sim-server.log', 'ab', buffering=0)
os.dup2(log.fileno(), 1)
os.dup2(log.fileno(), 2)
devnull = open('/dev/null', 'r')
os.dup2(devnull.fileno(), 0)
os.chdir('/tmp/prod-sim/next-service-dist')
os.execvp('bun', ['bun', 'server.js'])
EOF
echo "daemon lançado"
