#!/bin/bash
set -euo pipefail
# O deploy contém código e migrações; o banco vivo fica no volume persistente.
# Nunca escolher snapshots por quantidade de contas nem embutir o SQLite no build.
echo "Banco externo: configure DATABASE_URL no ambiente de execução. Nenhum SQLite será empacotado."
