#!/bin/sh
# Simula o bloco de persistência do start.sh (produção) em diretórios temp:
#  Cenário A: DATA_HOME novo → semeia a partir do pacote
#  Cenário B: DATA_HOME com banco existente → PRESERVA (não semeia por cima)
set -e
BUILD_DIR="/tmp/build_fullstack_verify-v07"

run_block() {
    DATA_HOME=""
    for d in "${GM_DATA_DIR:-}" "/app-data/guerreiros" "/data/guerreiros" "/var/lib/guerreiros"; do
        [ -z "$d" ] && continue
        if mkdir -p "$d" 2>/dev/null && [ -w "$d" ]; then DATA_HOME="$d"; break; fi
    done
    if [ -z "$DATA_HOME" ]; then
        DATA_HOME="$BUILD_DIR/db"
        echo "FALLBACK: banco no próprio pacote"
    fi
    echo "DATA_HOME=$DATA_HOME"
    if [ ! -f "$DATA_HOME/custom.db" ]; then
        echo "SEMEANDO a partir do pacote"
        cp "$BUILD_DIR/db/custom.db" "$DATA_HOME/custom.db"
    else
        echo "PRESERVADO (banco vivo existente)"
    fi
    if [ -d "$BUILD_DIR/db/avatars" ]; then
        mkdir -p "$DATA_HOME/avatars" 2>/dev/null || true
        cp -a "$BUILD_DIR/db/avatars/." "$DATA_HOME/avatars/" 2>/dev/null || true
    fi
    export DATABASE_URL="file:$DATA_HOME/custom.db"
}

echo "=== Cenário A: DATA_HOME novo ==="
export GM_DATA_DIR="/tmp/fake-datahome-a"
rm -rf "$GM_DATA_DIR"
run_block
[ -f "$GM_DATA_DIR/custom.db" ] && echo "✓ semeado" || { echo "✗ FALHOU"; exit 1; }
[ -f "$GM_DATA_DIR/avatars/avatar_cmtw2kyth0009mhr6u2wuqdja_1789077580991.png" ] && echo "✓ avatares copiados" || { echo "✗ avatares"; exit 1; }
echo "DATABASE_URL=$DATABASE_URL"

echo
echo "=== Cenário B: banco vivo já existe ==="
# marca o banco vivo com um valor para provar que não foi substituído
python3 - <<'EOF'
import sqlite3
con = sqlite3.connect('/tmp/fake-datahome-a/custom.db')
con.execute("INSERT INTO Account (id, username, usernameLower, passwordHash, isGuest, createdAt, updatedAt) VALUES ('vivo', 'vivo', 'vivo', '', 0, datetime('now'), datetime('now'))")
con.commit(); con.close()
EOF
run_block
python3 - <<'EOF'
import sqlite3
con = sqlite3.connect('/tmp/fake-datahome-a/custom.db')
cur = con.cursor()
cur.execute("SELECT COUNT(*) FROM Account WHERE id='vivo'")
print("✓ banco vivo PRESERVADO" if cur.fetchone()[0] == 1 else "✗ BANCO VIVO APAGADO!")
con.close()
EOF

echo
echo "=== Cenário C: sem volume externo (fallback pacote) ==="
export GM_DATA_DIR=""
run_block
case "$DATA_HOME" in
  "$BUILD_DIR/db") echo "✓ fallback correto" ;;
  *) echo "✗ fallback errado: $DATA_HOME"; exit 1 ;;
esac

rm -rf /tmp/fake-datahome-a
echo
echo "SIMULAÇÃO START.SH: TODOS OS CENÁRIOS PASSARAM"
