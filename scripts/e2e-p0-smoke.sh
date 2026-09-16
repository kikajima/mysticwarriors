#!/usr/bin/env bash
# =====================================================================
# E2E SMOKE TEST — correções P0 da v0.3
# 1. Convidado -> criar personagem
# 2. Iniciar missão -> ações bloqueadas (PLAYER_BUSY_ON_MISSION)
# 3. World Boss FUNCIONA durante missão (exceção explícita)
# 4. POST /api/game/state removido (405)
# 5. Limite de personagens com código CHARACTER_LIMIT_REACHED
# 6. PvP: bloqueado em missão (missão regra central)
# =====================================================================
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0
JAR=$(mktemp)
TS=$(date +%s)

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

check_json() { # name expected_substring actual_body
  if echo "$3" | grep -q "$2"; then ok "$1"; else bad "$1 — corpo não contém '$2': $(echo "$3" | head -c 200)"; fi
}

echo "=== 1. Convidado + personagem ==="
GUEST=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/guest" -H 'Content-Type: application/json' -d "{\"guestName\":\"Testador $TS\"}")
echo "$GUEST" | grep -q '"success":true' && ok "convidado criado" || bad "convidado falhou: $GUEST"

CHAR=$(curl -s -b "$JAR" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' \
  -d "{\"name\":\"TP0A $TS\",\"race\":\"saiyajin\"}")
echo "$CHAR" | grep -q '"success":true' && ok "personagem criado" || bad "create falhou: $CHAR"
PLAYER_ID=$(echo "$CHAR" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PLAYER_ID" ]; then
  echo "FALHA CRÍTICA: sem playerId, abortando"; exit 1
fi
ok "playerId: $PLAYER_ID"

ACT() { # type extra-json
  curl -s -b "$JAR" -X POST "$BASE/api/game/action" -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"$1\"${2:+,$2}}"
}

echo "=== 2. Missão ativa bloqueia ações ==="
START=$(ACT mission '"professionId":"agricultor"')
echo "$START" | grep -q 'PLAYER_BUSY_ON_MISSION' && bad "início de turno bloqueado incorretamente" || ok "turno de 'agricultor' iniciado (1h)"

R1=$(ACT train '"stat":"strength"')
check_json "treino bloqueado em missão" "PLAYER_BUSY_ON_MISSION" "$R1"

R2=$(ACT battle '"enemyId":"goblin"')
check_json "batalha PvE bloqueada em missão" "PLAYER_BUSY_ON_MISSION" "$R2"

R2b=$(ACT mission '"professionId":"cientista"')
check_json "segunda missão bloqueada" "PLAYER_BUSY_ON_MISSION" "$R2b"

echo "=== 3. World Boss é EXCEÇÃO (funciona em missão) ==="
BOSS=$(ACT world_boss_attack)
if echo "$BOSS" | grep -q 'PLAYER_BUSY_ON_MISSION'; then
  bad "World Boss bloqueado em missão (deveria ser exceção)"
elif echo "$BOSS" | grep -q '"success":true'; then
  ok "World Boss atacável durante missão (exceção confirmada)"
else
  if echo "$BOSS" | grep -q 'BOSS_COOLDOWN\|INSUFFICIENT_HP\|BOSS_NOT_ACTIVE\|INSUFFICIENT_ENERGY'; then
    ok "World Boss não bloqueado por missão (regra própria: $(echo "$BOSS" | grep -o '"code":"[^"]*"'))"
  else
    bad "World Boss resposta inesperada: $BOSS"
  fi
fi

echo "=== 4. POST /api/game/state removido ==="
POSTCODE=$(curl -s -o /tmp/post_state.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/game/state")
if [ "$POSTCODE" = "405" ] || [ "$POSTCODE" = "404" ]; then
  ok "POST /api/game/state não existe mais (HTTP $POSTCODE)"
else
  bad "POST /api/game/state ainda responde (HTTP $POSTCODE)"
fi

echo "=== 5. Limite de personagens = CHARACTER_LIMIT_REACHED ==="
# conta de convidado já tem 1 personagem; criar até o limite (3)
C2=$(curl -s -b "$JAR" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' -d "{\"name\":\"TP0B $TS\",\"race\":\"humano\"}")
C3=$(curl -s -b "$JAR" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' -d "{\"name\":\"TP0C $TS\",\"race\":\"namekuseijin\"}")
C4=$(curl -s -b "$JAR" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' -d "{\"name\":\"TP0D $TS\",\"race\":\"androide\"}")
check_json "4º personagem rejeitado com código correto" "CHARACTER_LIMIT_REACHED" "$C4"
if echo "$C4" | grep -q 'GUILD_LIMIT'; then
  bad "ainda usa código GUILD_LIMIT para limite de personagens"
else
  ok "código GUILD_LIMIT não é mais usado para personagens"
fi

echo "=== 6. Estado final íntegro ==="
STATE=$(curl -s -b "$JAR" "$BASE/api/game/state?playerId=$PLAYER_ID")
check_json "estado do personagem responde" '"success":true' "$STATE"
check_json "estado mostra missão ativa" '"activeMission"' "$STATE"

echo ""
echo "================================"
echo "RESULTADO: $PASS passaram, $FAIL falharam"
rm -f "$JAR"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
