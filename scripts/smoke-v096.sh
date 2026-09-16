#!/usr/bin/env bash
# =====================================================================
# smoke-v096.sh — PERSONAGEM ≠ CONTA + CANCELAR PROFISSÃO + RELÓGIO
# ---------------------------------------------------------------------
# Fluxo: convidado → personagem → treino → iniciar profissão →
#  * treino BLOQUEADO durante o turno (regra central)
#  * estado carrega serverNow (Mudança 1)
#  * CANCELAR o turno (Mudança 2): sem recompensa, sem missionsDone,
#    profissão liberada na hora → inicia OUTRO turno → cancela de novo
#  * snapshot v0.9.6: uma linha por personagem com id + cosmeticsOwned
#  * posse de cosméticos DO personagem no endpoint de conquistas
#  * restauração recusa convidado → limpeza.
# =====================================================================
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
JAR=$(mktemp)
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check() {
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (esperado=$2 obtido=$3)"; fi
}

echo "== v0.9.6 — PERSONAGEM ≠ CONTA · CANCELAR PROFISSÃO · RELÓGIO =="
echo "-- 1) sessão de convidado + personagem"
curl -s -o /tmp/g6.json -X POST "$BASE/api/auth/guest" -c "$JAR" -H 'Content-Type: application/json' -d '{}' >/dev/null
CODE=$(curl -s -o /tmp/c6.json -w "%{http_code}" -X POST "$BASE/api/game/create" -b "$JAR" -H 'Content-Type: application/json' -d '{"name":"Smoke V096 A","race":"saiyajin","gender":"male"}')
check "POST /api/game/create" 200 "$CODE"
PLAYER_ID=$(python3 -c "import json;print(json.load(open('/tmp/c6.json'))['player']['id'])")
ZENI0=$(python3 -c "import json;print(json.load(open('/tmp/c6.json'))['player']['zeni'])")
ok "playerId=$PLAYER_ID (zeni inicial $ZENI0)"

echo "-- 2) Mudança 1: /api/game/state carrega serverNow"
CODE=$(curl -s -o /tmp/st6.json -w "%{http_code}" "$BASE/api/game/state?playerId=$PLAYER_ID" -b "$JAR")
check "GET state" 200 "$CODE"
python3 - <<'EOF' && ok "serverNow presente e parseável" || fail "serverNow ausente"
import json
d = json.load(open('/tmp/st6.json'))
from datetime import datetime
t = datetime.fromisoformat(d['serverNow'].replace('Z','+00:00'))
assert abs((datetime.now().astimezone() - t).total_seconds()) < 60, "serverNow distante"
EOF

echo "-- 3) iniciar turno de profissão"
CODE=$(curl -s -o /tmp/m6.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"mission\",\"missionId\":\"agricultor\",\"requestId\":\"smoke-v096-m1-$(date +%s%N)\"}")
check "POST mission" 200 "$CODE"

echo "-- 4) durante o turno: treino BLOQUEADO (regra central)"
CODE=$(curl -s -o /tmp/b6.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"train\",\"stat\":\"strength\",\"requestId\":\"smoke-v096-b1-$(date +%s%N)\"}")
ERRCODE=$(python3 -c "import json;print(json.load(open('/tmp/b6.json'))['error']['code'])" 2>/dev/null || echo "?")
check "treino bloqueado durante turno (409 PLAYER_BUSY_ON_MISSION)" "PLAYER_BUSY_ON_MISSION" "$ERRCODE"

echo "-- 5) Mudança 2: CANCELAR o turno"
echo -n "$ZENI0" > /tmp/zeni0.txt
CODE=$(curl -s -o /tmp/x6.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"cancel_mission\",\"requestId\":\"smoke-v096-x1-$(date +%s%N)\"}")
check "POST cancel_mission" 200 "$CODE"
python3 - <<'EOF' && ok "cancelamento: sem recompensa, missão livre, estado coerente" || fail "efeitos do cancelamento errados"
import json
d = json.load(open('/tmp/x6.json'))
p = d['player']
assert p['activeMission'] is None, "missão ainda ativa?"
assert p['claimableMission'] is None, "não pode estar coletável"
assert p['missionsDone'] == 0, f"missionsDone={p['missionsDone']} (recompensa indevida?)"
assert p['zeni'] == int(open('/tmp/zeni0.txt').read().strip()), "zeni mudou no cancelamento"
EOF

echo "-- 6) cancelar de NOVO sem turno → erro amigável"
CODE=$(curl -s -o /tmp/x2.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"cancel_mission\",\"requestId\":\"smoke-v096-x2-$(date +%s%N)\"}")
ERRCODE=$(python3 -c "import json;print(json.load(open('/tmp/x2.json'))['error']['code'])" 2>/dev/null || echo "?")
check "cancelar sem turno → MISSION_NONE" "MISSION_NONE" "$ERRCODE"

echo "-- 7) profissão liberada na hora: inicia OUTRO turno e cancela"
CODE=$(curl -s -o /tmp/m7.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"mission\",\"missionId\":\"cientista\",\"requestId\":\"smoke-v096-m2-$(date +%s%N)\"}")
check "POST mission (cientista, imediatamente após cancelar)" 200 "$CODE"
CODE=$(curl -s -o /tmp/x3.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"cancel_mission\",\"requestId\":\"smoke-v096-x3-$(date +%s%N)\"}")
check "POST cancel_mission (2º turno)" 200 "$CODE"

echo "-- 8) Mudança 3: snapshot v0.9.6 (linha por personagem)"
CODE=$(curl -s -o /tmp/s6.json -w "%{http_code}" "$BASE/api/game/cloud-snapshot?playerId=$PLAYER_ID" -b "$JAR")
check "GET cloud-snapshot" 200 "$CODE"
python3 - <<'EOF' && ok "linha do personagem com id + posse própria" || fail "snapshot v0.9.6 incorreto"
import json
d = json.load(open('/tmp/s6.json'))
rows = d['personagens']
assert len(rows) == 1
row = rows[0]
assert row['id'] and row['nome'] == 'Smoke V096 A'
# user_id é acrescentado pelo CLIENTE no upsert (sessão do dono) — não
# faz parte da resposta do servidor
assert set(['id','nome','raca','nivel','poder','vitorias','derrotas','ativo','estado']) - set(row.keys()) == set()
est = row['estado']
assert est['id'] == row['id'], "id divergente entre linha e estado"
assert est['cosmeticsOwned'] == [], "convidado novo não possui cosméticos"
assert est['missionId'] is None, "turno cancelado ainda no snapshot?"
EOF

echo "-- 9) Mudança 3: posse de cosméticos DO personagem no endpoint"
CODE=$(curl -s -o /tmp/ac6.json -w "%{http_code}" "$BASE/api/game/achievements?playerId=$PLAYER_ID" -b "$JAR")
check "GET achievements" 200 "$CODE"
python3 - <<'EOF' && ok "ownedCosmetics por personagem (lista vazia para novo)" || fail "ownedCosmetics incoerente"
import json
d = json.load(open('/tmp/ac6.json'))
assert d['ownedCosmetics'] == [], f"ownedCosmetics={d['ownedCosmetics']}"
EOF

echo "-- 10) restauração exige conta Supabase (convidado → 403)"
CODE=$(curl -s -o /tmp/r6.json -w "%{http_code}" -X POST "$BASE/api/game/cloud-restore" -b "$JAR" -H 'Content-Type: application/json' -d '{"personagens":[]}')
check "cloud-restore recusa convidado" 403 "$CODE"

echo "-- 11) ranking público de pé"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/ranking")
check "GET /ranking" 200 "$CODE"

echo "-- 12) limpeza (personagem de TESTE + conta de convidado)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/game/character/$PLAYER_ID" -b "$JAR")
check "DELETE personagem de teste" 200 "$CODE"
curl -s -X POST "$BASE/api/auth/logout" -b "$JAR" -o /dev/null || true
bun run "$(dirname "$0")/cleanup-guest-accounts.ts" >/dev/null 2>&1 || true
rm -f "$JAR" /tmp/{g6,c6,st6,m6,b6,x6,x2,m7,x3,s6,ac6,r6}.json /tmp/zeni0.txt

echo
echo "RESULTADO: $PASS ✓ / $FAIL ✗"
[ "$FAIL" = "0" ]
