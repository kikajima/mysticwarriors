#!/usr/bin/env bash
# =====================================================================
# E2E v0.9.11 — COOLDOWN DO CHEFE GLOBAL (regressão corrigida: 60s → 10s)
#  1. Convidado → criar personagem; view do boss existe (spawn preguiçoso)
#  2. Ataque #1 → sucesso; resposta traz cooldownSec = 10
#  3. Ataque imediato #2 → 429 BOSS_COOLDOWN; NADA muda (HP, dano pessoal)
#  4. +3 tentativas rápidas → todas 429; rate limit NÃO bloqueia indevidamente
#  5. Após ~11s → ataque #3 → sucesso (cooldown realmente expira em 10s)
#  6. canAttackAt ≈ ataque + 10s (relógio do servidor, sem fantasmas)
#  7. Energia: 100 → 70 (3 ataques × 10; rejeitados não gastam nada)
# =====================================================================
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0
JAR=$(mktemp)
TS=$(date +%s)

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

check_json() { # name expected_substring actual_body
  if echo "$3" | grep -q "$2"; then ok "$1"; else bad "$1 — corpo não contém '$2': $(echo "$3" | head -c 250)"; fi
}

echo "=== 1. Convidado + personagem + view do boss ==="
GUEST=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/guest" -H 'Content-Type: application/json' -d "{\"guestName\":\"BossCd $TS\"}")
echo "$GUEST" | grep -q '"success":true' && ok "convidado criado" || bad "convidado falhou: $GUEST"

CHAR=$(curl -s -b "$JAR" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Tcd $TS\",\"race\":\"humano\"}")
echo "$CHAR" | grep -q '"success":true' && ok "personagem criado" || bad "create falhou: $CHAR"
PLAYER_ID=$(echo "$CHAR" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$PLAYER_ID" ] && ok "playerId obtido" || { echo "FALHA CRÍTICA: sem playerId"; exit 1; }

# O calendário real pode estar fora da janela da Ameaça Universal.
# Para testar especificamente cooldown/dano de forma determinística, este
# banco efêmero de CI recebe uma invocação administrativa de QA.
bun scripts/e2e-db.ts invoke-boss >/dev/null

ACT() { # type extra-json
  curl -s -w '\n%{http_code}' -b "$JAR" -X POST "$BASE/api/game/action" -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"$1\"${2:+,$2}}"
}
VIEW() {
  curl -s -b "$JAR" "$BASE/api/game/worldboss?playerId=$PLAYER_ID"
}

V0=$(VIEW)
echo "$V0" | python3 -c "import sys,json; b=json.load(sys.stdin)['boss']; assert b is not None" >/dev/null 2>&1 \
  && ok "chefe aparece na view (spawn preguiçoso funciona)" || bad "view sem boss: $V0"
H0=$(echo "$V0" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['currentHp'])")
[ -n "$H0" ] && ok "HP inicial do chefe: $H0" || bad "sem HP na view"

echo "=== 2. Ataque #1 → sucesso com cooldownSec = 10 ==="
A1=$(ACT world_boss_attack)
A1_BODY=$(echo "$A1" | head -n -1); A1_CODE=$(echo "$A1" | tail -n 1)
[ "$A1_CODE" = "200" ] && ok "ataque #1 aceito (HTTP 200)" || bad "ataque #1 HTTP $A1_CODE: $A1_BODY"
D1=$(echo "$A1_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['bossAttack']['damage'])" 2>/dev/null)
[ -n "$D1" ] && [ "$D1" -gt 0 ] && ok "dano #1: $D1" || bad "sem dano no ataque #1: $A1_BODY"
CS=$(echo "$A1_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['bossAttack']['cooldownSec'])" 2>/dev/null)
[ "$CS" = "10" ] && ok "resposta declara cooldownSec = 10 SEGUNDOS" || bad "cooldownSec veio: $CS (esperado 10)"

echo "=== 3. Ataque imediato → 429 BOSS_COOLDOWN sem efeito nenhum ==="
V1=$(VIEW)
H1=$(echo "$V1" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['currentHp'])")
M1=$(echo "$V1" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['myDamage'])")
CA1=$(echo "$V1" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['canAttackAt'])")
NOWSRV=$(echo "$A1_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['serverNow'])")
[ "$H1" = "$((H0 - D1))" ] && ok "HP do chefe decrementado exatamente d1 ($H0 → $H1)" || bad "HP: esperado $((H0-D1)), veio $H1"
[ "$M1" = "$D1" ] && ok "dano pessoal = linha do servidor ($M1)" || bad "myDamage: esperado $D1, veio $M1"
[ -n "$CA1" ] && [ "$CA1" != "None" ] && ok "canAttackAt presente na view" || bad "canAttackAt ausente: $V1"
# canAttackAt ≈ ataque#1 + 10s (janela tolerante 8..12s p/ trânsito)
DELTA=$(python3 -c "
from datetime import datetime
def p(s): return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
print(int(p('$CA1') - p('$NOWSRV')))" 2>/dev/null)
[ -n "$DELTA" ] && [ "$DELTA" -ge 8 ] && [ "$DELTA" -le 12 ] \
  && ok "canAttackAt = ataque + ${DELTA}s (≈10s, relógio do servidor)" || bad "delta canAttackAt: ${DELTA:-parse-fail} (esperado 8..12)"

A2=$(ACT world_boss_attack)
A2_BODY=$(echo "$A2" | head -n -1); A2_CODE=$(echo "$A2" | tail -n 1)
[ "$A2_CODE" = "429" ] && ok "ataque no cooldown → HTTP 429" || bad "esperado 429, veio $A2_CODE: $A2_BODY"
check_json "erro é BOSS_COOLDOWN" 'BOSS_COOLDOWN' "$A2_BODY"
check_json "mensagem amigável com contagem" 'aguarde' "$A2_BODY"

V2=$(VIEW)
H2=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['currentHp'])")
M2=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['myDamage'])")
[ "$H2" = "$H1" ] && ok "HP do chefe INTACTO após rejeição (sem dano fantasma)" || bad "HP mudou: $H1 → $H2"
[ "$M2" = "$M1" ] && ok "dano pessoal INTACTO após rejeição (sem soma/subtração)" || bad "myDamage mudou: $M1 → $M2"

echo "=== 4. +3 tentativas rápidas → 429; rate limit não bloqueia indevidamente ==="
ALL429=1
for i in 1 2 3; do
  AX=$(ACT world_boss_attack); AX_CODE=$(echo "$AX" | tail -n 1)
  [ "$AX_CODE" = "429" ] || { ALL429=0; bad "tentativa extra $i: HTTP $AX_CODE (esperado 429)"; }
done
[ "$ALL429" = "1" ] && ok "3 tentativas extra rejeitadas com 429 (sem dano em nenhuma)"
V3=$(VIEW)
H3=$(echo "$V3" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['currentHp'])")
M3=$(echo "$V3" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['myDamage'])")
[ "$H3" = "$H1" ] && [ "$M3" = "$M1" ] && ok "totais seguem intactos após 4 rejeições" || bad "totais mudaram: HP $H3, dano $M3"

echo "=== 5. Após 11s → ataque #3 funciona (cooldown expira em 10s) ==="
sleep 11
A3=$(ACT world_boss_attack)
A3_BODY=$(echo "$A3" | head -n -1); A3_CODE=$(echo "$A3" | tail -n 1)
[ "$A3_CODE" = "200" ] && ok "ataque #3 aceito após o cooldown (HTTP 200)" || bad "ataque #3 HTTP $A3_CODE: $A3_BODY"
D2=$(echo "$A3_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['bossAttack']['damage'])" 2>/dev/null)
[ -n "$D2" ] && [ "$D2" -gt 0 ] && ok "dano #2: $D2" || bad "sem dano no ataque #3"
V4=$(VIEW)
M4=$(echo "$V4" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['myDamage'])")
H4=$(echo "$V4" | python3 -c "import sys,json; print(json.load(sys.stdin)['boss']['currentHp'])")
[ "$M4" = "$((D1 + D2))" ] && ok "dano pessoal acumulou d1+d2 = $M4 (linha única coerente)" || bad "myDamage: esperado $((D1+D2)), veio $M4"
[ "$H4" = "$((H0 - D1 - D2))" ] && ok "HP global = H0 - d1 - d2 (nunca sobe)" || bad "HP: esperado $((H0-D1-D2)), veio $H4"

echo "=== 6. Energia: 2 ataques bem-sucedidos × 10 = 80 (rejeitados não gastam) ==="
S=$(curl -s -b "$JAR" "$BASE/api/game/state?playerId=$PLAYER_ID")
EN=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin)['player']['energy'])" 2>/dev/null)
[ "$EN" = "80" ] && ok "energia final: 80 (4 rejeições não gastaram nada)" || bad "energia: esperado 80, veio $EN"

echo
echo "RESULTADO: $PASS ✓ / $FAIL ✗"
if [ "$FAIL" -gt 0 ]; then
  echo "E2E v0.9.11 boss-cooldown: FALHOU"
  exit 1
fi
echo "E2E v0.9.11 boss-cooldown: TODOS OS TESTES PASSARAM"
