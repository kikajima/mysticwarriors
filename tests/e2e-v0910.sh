#!/usr/bin/env bash
# =====================================================================
# E2E SMOKE TEST v0.9.10 — LOJA COM QUANTIDADES + VENDA + SEGURANÇA
#  1. Convidado → criar personagem
#  2. Comprar 2× Gi (500 Zeni) — equipamento EMPILHÁVEL
#  3. Equipar 1 unidade; vender 1 reserva (125 Zeni)
#  4. Vender a unidade EQUIPADA → bloqueado (ITEM_EQUIPPED, aviso amigável)
#  5. Desequipar → vender a última unidade
#  6. Validações de quantidade (0, 100, 1.5) recusadas
#  7. Venda de item não possuído recusada
#  8. /api/admin/reset-server sem token de admin → 404 (invisível)
#  9. Estado final: carteira e inventário coerentes com o servidor
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

echo "=== 1. Convidado + personagem ==="
GUEST=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/guest" -H 'Content-Type: application/json' -d "{\"guestName\":\"Testador $TS\"}")
echo "$GUEST" | grep -q '"success":true' && ok "convidado criado" || bad "convidado falhou: $GUEST"

CHAR=$(curl -s -b "$JAR" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' \
  -d "{\"name\":\"T910 $TS\",\"race\":\"humano\"}")
echo "$CHAR" | grep -q '"success":true' && ok "personagem criado" || bad "create falhou: $CHAR"
PLAYER_ID=$(echo "$CHAR" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$PLAYER_ID" ] && ok "playerId obtido" || { echo "FALHA CRÍTICA: sem playerId"; exit 1; }

ACT() { # type extra-json
  curl -s -b "$JAR" -X POST "$BASE/api/game/action" -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$PLAYER_ID\",\"type\":\"$1\"${2:+,$2}}"
}
STATE() {
  curl -s -b "$JAR" "$BASE/api/game/state?playerId=$PLAYER_ID"
}

echo "=== 2. Comprar 2× Gi de Batalha (250 Zeni cada) — empilhável ==="
BUY2=$(ACT buy '"itemId":"gi","quantity":2')
check_json "compra de 2 unidades aceita" '"success":true' "$BUY2"
check_json "mensagem mostra total 500" '500' "$BUY2"

S1=$(STATE)
ZENI1=$(echo "$S1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['player']['zeni'])" 2>/dev/null)
[ "$ZENI1" = "0" ] && ok "carteira debitada: 500 → 0 Zeni" || bad "zeni esperado 0, veio: $ZENI1"
echo "$S1" | python3 -c "
import sys, json
d = json.load(sys.stdin)['player']['items']
assert 'gi' in d['owned'], 'gi não está em owned'
assert d.get('stacks',{}).get('gi') == 2, f'stacks.gi esperado 2, veio {d.get(\"stacks\")}'
print('OK')" >/dev/null 2>&1 && ok "inventário: owned=[gi] + stacks {gi:2}" || bad "estrutura do inventário errada"

echo "=== 3. Equipar 1 unidade e vender 1 reserva ==="
EQUIP=$(ACT equip '"itemId":"gi"')
check_json "gi equipado" '"success":true' "$EQUIP"

SELL1=$(ACT sell '"itemId":"gi","quantity":1')
check_json "venda de 1 reserva aceita" '"success":true' "$SELL1"
check_json "crédito de 125 Zeni na mensagem" '125' "$SELL1"

S2=$(STATE)
ZENI2=$(echo "$S2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['player']['zeni'])" 2>/dev/null)
[ "$ZENI2" = "125" ] && ok "carteira creditada: 0 → 125 Zeni (50% de 250)" || bad "zeni esperado 125, veio: $ZENI2"
echo "$S2" | python3 -c "
import sys, json
d = json.load(sys.stdin)['player']['items']
assert d['armor'] == 'gi', 'gi deveria seguir equipado'
assert 'gi' in d['owned'], 'gi deveria continuar em owned (1 unidade)'
assert not d.get('stacks',{}).get('gi'), 'stacks.gi deveria estar vazia'
print('OK')" >/dev/null 2>&1 && ok "unidade equipada preservada após venda da reserva" || bad "item equipado foi perdido"

echo "=== 4. Vender a unidade EQUIPADA → bloqueio amigável ==="
SELL_EQ=$(ACT sell '"itemId":"gi","quantity":1')
check_json "venda de equipado recusada" 'ITEM_EQUIPPED' "$SELL_EQ"
check_json "aviso pede para deseque" 'Desequipe' "$SELL_EQ"

echo "=== 5. Desequipar e vender a última unidade ==="
UNEQUIP=$(ACT unequip '"slot":"armor"')
check_json "gi guardado no inventário" '"success":true' "$UNEQUIP"
SELL2=$(ACT sell '"itemId":"gi","quantity":1')
check_json "venda da última unidade aceita" '"success":true' "$SELL2"
S3=$(STATE)
echo "$S3" | python3 -c "
import sys, json
d = json.load(sys.stdin)['player']['items']
assert 'gi' not in d['owned'], 'gi deveria ter saído de owned'
assert not d.get('stacks',{}).get('gi'), 'stacks.gi deveria estar vazia'
print('OK')" >/dev/null 2>&1 && ok "inventário limpo após vender tudo" || bad "gi ainda no inventário"

echo "=== 6. Validações de quantidade (servidor) ==="
Q0=$(ACT buy '"itemId":"gi","quantity":0')
check_json "quantity 0 recusado" 'VALIDATION_ERROR' "$Q0"
Q100=$(ACT buy '"itemId":"luvas","quantity":100')
check_json "quantity 100 recusado (máx 99)" 'Máximo de 99' "$Q100"
QFRAC=$(ACT buy '"itemId":"luvas","quantity":1.5')
check_json "quantity 1.5 recusado" 'número inteiro' "$QFRAC"

echo "=== 7. Venda de item não possuído ==="
SELL_NO=$(ACT sell '"itemId":"katana","quantity":1')
check_json "venda sem posse recusada" 'ITEM_NOT_OWNED' "$SELL_NO"

echo "=== 8. Rota de reset: invisível sem admin ==="
R1=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/reset-server" -H 'Content-Type: application/json' -d '{"confirm":"RESET"}')
[ "$R1" = "404" ] && ok "sem token → 404 (rota invisível)" || bad "sem token → $R1 (esperado 404)"
R2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/reset-server" -H 'Content-Type: application/json' -H 'Authorization: Bearer token-falso' -d '{"confirm":"RESET"}')
[ "$R2" = "404" ] && ok "token inválido → 404" || bad "token inválido → $R2 (esperado 404)"
R3=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/reset-server")
[ "$R3" = "404" ] && ok "GET → 404 (não-descobrível)" || bad "GET → $R3 (esperado 404)"

echo "=== 9. Coerência final (carteira = 250 Zeni, gi fora do inventário) ==="
ZENI3=$(echo "$S3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['player']['zeni'])" 2>/dev/null)
[ "$ZENI3" = "250" ] && ok "zeni final: 250 (500 - 500 + 125 + 125)" || bad "zeni final esperado 250, veio: $ZENI3"

echo ""
echo "RESULTADO: $PASS ✓ / $FAIL ✗"
[ "$FAIL" -eq 0 ] && echo "E2E v0.9.10: TODOS OS TESTES PASSARAM" || echo "E2E v0.9.10: HÁ FALHAS"
exit $FAIL
