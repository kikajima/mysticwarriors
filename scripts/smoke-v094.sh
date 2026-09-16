#!/usr/bin/env bash
# =====================================================================
# smoke-v094.sh — TUDO NA NUVEM (v0.9.4): validação de ponta a ponta
# ---------------------------------------------------------------------
# Fluxo: convidado → cria personagem → joga (treino) → inicia profissão
# → QUESTS existem → snapshot v2 contém quests/mission/regen →
# restauração NÃO roda para convidado (correto) → limpeza.
# =====================================================================
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
JAR=$(mktemp)
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check() { # check <desc> <esperado> <obtido>
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (esperado=$2 obtido=$3)"; fi
}

echo "== v0.9.4 — TUDO NA NUVEM =="
echo "-- 1) sessão de convidado"
CODE=$(curl -s -o /tmp/g.json -w "%{http_code}" -X POST "$BASE/api/auth/guest" -c "$JAR" -H 'Content-Type: application/json' -d '{}')
check "POST /api/auth/guest" 200 "$CODE"

echo "-- 2) criar personagem de TESTE"
CODE=$(curl -s -o /tmp/c.json -w "%{http_code}" -X POST "$BASE/api/game/create" -b "$JAR" -H 'Content-Type: application/json' -d '{"name":"Smoke V094","race":"saiyajin","gender":"male"}')
check "POST /api/game/create" 200 "$CODE"
PLAYER_ID=$(python3 -c "import json;print(json.load(open('/tmp/c.json'))['player']['id'])" 2>/dev/null || echo "")
[ -n "$PLAYER_ID" ] && ok "playerId=$PLAYER_ID" || fail "playerId ausente"

echo "-- 3) treinar (ação instantânea v0.9)"
CODE=$(curl -s -o /tmp/a.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"train\",\"stat\":\"strength\",\"requestId\":\"smoke-v094-train-$(date +%s)\"}")
check "POST train" 200 "$CODE"

echo "-- 4) iniciar turno de profissão (missão temporizada)"
CODE=$(curl -s -o /tmp/m.json -w "%{http_code}" -X POST "$BASE/api/game/action" -b "$JAR" -H 'Content-Type: application/json' -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"mission\",\"missionId\":\"agricultor\",\"requestId\":\"smoke-v094-miss-$(date +%s)\"}")
check "POST mission (profissão)" 200 "$CODE"

echo "-- 5) quests do período existem"
CODE=$(curl -s -o /tmp/q.json -w "%{http_code}" "$BASE/api/game/quests?playerId=$PLAYER_ID" -b "$JAR")
check "GET quests" 200 "$CODE"
NQUESTS=$(python3 -c "import json;print(len(json.load(open('/tmp/q.json'))['quests']))" 2>/dev/null || echo 0)
[ "${NQUESTS:-0}" -ge 3 ] && ok "quests geradas: $NQUESTS" || fail "quests insuficientes: $NQUESTS"

echo "-- 6) snapshot v0.9.6 (uma linha por personagem)"
CODE=$(curl -s -o /tmp/s.json -w "%{http_code}" "$BASE/api/game/cloud-snapshot?playerId=$PLAYER_ID" -b "$JAR")
check "GET cloud-snapshot" 200 "$CODE"
python3 - <<'EOF' && ok "snapshot contém quests/mission/regen/cosméticos próprios (v3)" || fail "snapshot sem campos v0.9.6"
import json, sys
d = json.load(open('/tmp/s.json'))
rows = d['personagens']
assert len(rows) == 1, f"personagens={len(rows)}"
c = rows[0]['estado']
assert rows[0]['id'], "id ausente"
assert isinstance(c['quests'], list) and len(c['quests']) >= 3, "quests ausentes"
assert c['missionId'] == 'agricultor', f"missionId={c.get('missionId')}"
assert c['missionEndsAt'], "missionEndsAt ausente"
assert c['lastRegen'], "lastRegen ausente"
assert isinstance(c['cosmeticsOwned'], list), "cosmeticsOwned ausente"
assert c['id'], "id do personagem ausente no estado"
q = c['quests'][0]
assert set(q.keys()) == {'questId','kind','period','progress','claimed'}, f"keys={q.keys()}"
EOF

echo "-- 7) restauração exige conta Supabase (convidado → 403)"
CODE=$(curl -s -o /tmp/r.json -w "%{http_code}" -X POST "$BASE/api/game/cloud-restore" -b "$JAR" -H 'Content-Type: application/json' -d '{"progresso":{"version":2,"characters":[]}}')
check "cloud-restore recusa convidado" 403 "$CODE"

echo "-- 8) ranking público responde (nuvem ausente → fallback local)"
CODE=$(curl -s -o /tmp/rk.html -w "%{http_code}" "$BASE/ranking")
check "GET /ranking" 200 "$CODE"

echo "-- 9) limpeza (apenas o personagem de TESTE deste script)"
CODE=$(curl -s -o /tmp/d.json -w "%{http_code}" -X DELETE "$BASE/api/game/character/$PLAYER_ID" -b "$JAR")
check "DELETE personagem de teste" 200 "$CODE"
curl -s -X POST "$BASE/api/auth/logout" -b "$JAR" -o /dev/null || true
rm -f "$JAR" /tmp/{g,c,a,m,q,s,r,d}.json
# v0.9.5: a sessão de convidado do smoke deixa a conta órfã no banco —
# remove para o teste de persistência (espera 0 contas) continuar verde.
bun run "$(dirname "$0")/cleanup-guest-accounts.ts" >/dev/null 2>&1 || true

echo
echo "RESULTADO: $PASS ✓ / $FAIL ✗"
[ "$FAIL" = "0" ]
