#!/usr/bin/env bash
# =============================================================================
# ETAPA 11 — SMOKE FUNCIONAL ESTENDIDO DE RELEASE
# Cobre subsistemas que não fazem parte do smoke histórico principal:
# Oficina, Mercado/escrow, amizade/chat, cosméticos, torneio,
# inventário/equipamentos e Chaves do Horizonte/Aethelgard.
#
# O script só altera personagens ExtA/ExtB criados nesta própria execução.
# Helpers diretos de banco recusam qualquer personagem fora do MW_E2E_RUN_ID.
# =============================================================================
set -u

BASE="http://localhost:3000"
PASS=0
FAIL=0
TS=$(date +%s%N | cut -b1-13)
export MW_E2E_RUN_ID="$TS"
JAR_A=$(mktemp)
JAR_B=$(mktemp)
IP_A="e2e-ext-a-$TS"
IP_B="e2e-ext-b-$TS"

check() {
  local desc="$1" expected="$2" got="$3"
  if [ "$expected" = "$got" ]; then
    PASS=$((PASS+1)); echo "✓ $desc"
  else
    FAIL=$((FAIL+1)); echo "✗ FALHOU: $desc (esperado=$expected obtido=$got)"
  fi
}

uuid() {
  python3 -c 'import uuid; print(uuid.uuid4())'
}

cleanup() {
  bun scripts/e2e-db.ts cleanup-run "$TS" >/dev/null 2>&1 || true
  rm -f "$JAR_A" "$JAR_B"
}
trap cleanup EXIT

echo "=== EXT 0. PREPARAÇÃO ISOLADA ==="
R=$(curl -s -c "$JAR_A" -H "X-Forwarded-For: $IP_A" -X POST "$BASE/api/auth/guest")
check "convidado A criado" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -c "$JAR_B" -H "X-Forwarded-For: $IP_B" -X POST "$BASE/api/auth/guest")
check "convidado B criado" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"

R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' \
  -d "{\"name\":\"ExtA$TS\",\"race\":\"humano\"}")
PA=$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "personagem A criado" "ok" "$([ -n "$PA" ] && echo ok || echo erro)"

R=$(curl -s -b "$JAR_B" -X POST "$BASE/api/game/create" -H 'Content-Type: application/json' \
  -d "{\"name\":\"ExtB$TS\",\"race\":\"androide\"}")
PB=$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "personagem B criado" "ok" "$([ -n "$PB" ] && echo ok || echo erro)"

if [ -z "$PA" ] || [ -z "$PB" ]; then
  echo "FALHA CRÍTICA: personagens QA não foram criados"
  exit 1
fi
SETUP=$(bun scripts/e2e-db.ts setup-release-extended "$PA" "$PB" 2>/dev/null | tail -1)
check "fixture QA estendida preparada" "ok" "$SETUP"

act() {
  local jar="$1" player="$2" payload="$3"
  curl -s -b "$jar" -X POST "$BASE/api/game/action" -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$player\",$payload}"
}

echo ""
echo "=== EXT 1. OFICINA: iniciar, cancelar e coletar ==="
R=$(act "$JAR_A" "$PA" '"type":"craft_start","recipeId":"capsula_recuperacao_simples","quantity":2')
check "iniciar lote 2× na Oficina" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -b "$JAR_A" "$BASE/api/game/workshop?playerId=$PA")
check "job da Oficina exposto no endpoint" "2" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["job"]["outputQuantity"])' 2>/dev/null)"

R=$(act "$JAR_A" "$PA" '"type":"craft_cancel"')
check "cancelamento da Oficina aceito" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -b "$JAR_A" "$BASE/api/game/workshop?playerId=$PA")
check "cancelamento remove job" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["job"] is None)' 2>/dev/null)"
check "cancelamento devolve ervas" "20" "$(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(x["quantity"] for x in d["inventory"] if x["itemId"]=="erva_medicinal"))' 2>/dev/null)"

R=$(act "$JAR_A" "$PA" '"type":"craft_start","recipeId":"capsula_recuperacao_simples","quantity":1')
check "segunda fabricação iniciada" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
bun scripts/e2e-db.ts finish-craft "$PA" >/dev/null
R=$(act "$JAR_A" "$PA" '"type":"craft_claim"')
check "coleta da fabricação concluída" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -b "$JAR_A" "$BASE/api/game/state?playerId=$PA")
check "consumível fabricado entrou no inventário" "1" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["items"]["consumables"].get("capsula_recuperacao_simples",0))' 2>/dev/null)"

echo ""
echo "=== EXT 2. MERCADO: anúncio, dedup, compra e ordem com escrow ==="
REQ=$(uuid)
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/game/market" -H 'Content-Type: application/json' \
  -d "{\"action\":\"create\",\"playerId\":\"$PA\",\"requestId\":\"$REQ\",\"itemId\":\"erva_medicinal\",\"quantity\":3,\"currency\":\"zeni\",\"unitPrice\":40}")
check "anúncio de material criado" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R2=$(curl -s -b "$JAR_A" -X POST "$BASE/api/game/market" -H 'Content-Type: application/json' \
  -d "{\"action\":\"create\",\"playerId\":\"$PA\",\"requestId\":\"$REQ\",\"itemId\":\"erva_medicinal\",\"quantity\":3,\"currency\":\"zeni\",\"unitPrice\":40}")
check "replay de anúncio é deduplicado" "True" "$(echo "$R2" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("deduplicated",False))' 2>/dev/null)"

M=$(curl -s -b "$JAR_A" "$BASE/api/game/market?playerId=$PA&page=1&pageSize=20")
LISTING=$(echo "$M" | python3 -c 'import json,sys; d=json.load(sys.stdin)["market"]["myListings"]; print(next(x["id"] for x in d if x["itemId"]=="erva_medicinal" and x["status"]=="active"))' 2>/dev/null)
check "anúncio aparece em Meus anúncios" "ok" "$([ -n "$LISTING" ] && echo ok || echo erro)"

REQ=$(uuid)
R=$(curl -s -b "$JAR_B" -X POST "$BASE/api/game/market" -H 'Content-Type: application/json' \
  -d "{\"action\":\"buy\",\"playerId\":\"$PB\",\"requestId\":\"$REQ\",\"listingId\":\"$LISTING\",\"quantity\":2}")
check "outro jogador compra 2 unidades" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
M=$(curl -s -b "$JAR_A" "$BASE/api/game/market?playerId=$PA&page=1&pageSize=20")
check "anúncio preserva apenas 1 unidade restante" "1" "$(echo "$M" | python3 -c 'import json,sys; d=json.load(sys.stdin)["market"]["myListings"]; print(next(x["quantityRemaining"] for x in d if x["id"]=="'"$LISTING"'"))' 2>/dev/null)"

REQ=$(uuid)
R=$(curl -s -b "$JAR_B" -X POST "$BASE/api/game/market" -H 'Content-Type: application/json' \
  -d "{\"action\":\"create_buy_order\",\"playerId\":\"$PB\",\"requestId\":\"$REQ\",\"itemId\":\"liga_metais_leves\",\"quantity\":2,\"currency\":\"zeni\",\"unitPrice\":30}")
check "ordem de compra reserva saldo em escrow" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
M=$(curl -s -b "$JAR_B" "$BASE/api/game/market?playerId=$PB&page=1&pageSize=20")
ORDER=$(echo "$M" | python3 -c 'import json,sys; d=json.load(sys.stdin)["market"]["myBuyOrders"]; print(next(x["id"] for x in d if x["itemId"]=="liga_metais_leves" and x["status"]=="active"))' 2>/dev/null)
check "ordem aparece em Minhas propostas" "ok" "$([ -n "$ORDER" ] && echo ok || echo erro)"
REQ=$(uuid)
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/game/market" -H 'Content-Type: application/json' \
  -d "{\"action\":\"fulfill_buy_order\",\"playerId\":\"$PA\",\"requestId\":\"$REQ\",\"orderId\":\"$ORDER\",\"quantity\":2}")
check "vendedor atende a ordem de compra" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"

echo ""
echo "=== EXT 3. AMIZADE, CHAT PRIVADO E BLOQUEIO ==="
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/chat" -H 'Content-Type: application/json' \
  -d "{\"action\":\"send_friend_request\",\"playerId\":\"$PA\",\"targetId\":\"$PB\"}")
check "A envia pedido de amizade a B" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -b "$JAR_B" -X POST "$BASE/api/chat" -H 'Content-Type: application/json' \
  -d "{\"action\":\"accept_friend_request\",\"playerId\":\"$PB\",\"targetId\":\"$PA\"}")
check "B aceita pedido de amizade" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"

MSG="canal-privado-$TS"
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/chat" -H 'Content-Type: application/json' \
  -d "{\"action\":\"send\",\"playerId\":\"$PA\",\"channel\":\"private\",\"targetId\":\"$PB\",\"body\":\"$MSG\"}")
check "mensagem privada entre amigos enviada" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -b "$JAR_B" "$BASE/api/chat?playerId=$PB&channel=private&targetId=$PA")
check "B lê a mensagem privada de A" "$MSG" "$(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["messages"][-1]["body"] if d.get("messages") else "")' 2>/dev/null)"

R=$(curl -s -b "$JAR_B" -X POST "$BASE/api/chat" -H 'Content-Type: application/json' \
  -d "{\"action\":\"block\",\"playerId\":\"$PB\",\"targetId\":\"$PA\"}")
check "B bloqueia A" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/chat" -H 'Content-Type: application/json' \
  -d "{\"action\":\"send\",\"playerId\":\"$PA\",\"channel\":\"private\",\"targetId\":\"$PB\",\"body\":\"bloqueada\"}")
check "bloqueio impede nova mensagem privada" "FORBIDDEN" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)"

echo ""
echo "=== EXT 4. COSMÉTICOS PÚBLICOS ==="
R=$(act "$JAR_A" "$PA" '"type":"buy_cosmetic","cosmeticId":"aura_ki_pulsante"')
check "cosmético comprado com cristais" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(act "$JAR_A" "$PA" '"type":"equip_cosmetic","cosmeticId":"aura_ki_pulsante"')
check "cosmético equipado" "aura_ki_pulsante" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["cosmetics"]["equipped"]["aura"])' 2>/dev/null)"
R=$(act "$JAR_A" "$PA" '"type":"buy_cosmetic","cosmeticId":"aura_ki_pulsante"')
check "compra duplicada de cosmético é recusada" "ITEM_ALREADY_OWNED" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)"

echo ""
echo "=== EXT 5. INVENTÁRIO E EQUIPAMENTO ==="
R=$(act "$JAR_A" "$PA" '"type":"buy","itemId":"gi","quantity":1')
check "equipamento comprado" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(act "$JAR_A" "$PA" '"type":"equip","itemId":"gi"')
check "equipamento ocupa slot de armadura" "gi" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["items"]["armor"])' 2>/dev/null)"
R=$(act "$JAR_A" "$PA" '"type":"unequip","slot":"armor"')
check "desequipar limpa slot" "None" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["items"]["armor"])' 2>/dev/null)"
R=$(act "$JAR_A" "$PA" '"type":"sell","itemId":"gi","quantity":1')
check "equipamento guardado pode ser vendido" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"

echo ""
echo "=== EXT 6. TORNEIO: inscrição e atividade server-side ==="
R=$(act "$JAR_A" "$PA" '"type":"tournament_fight"')
check "luta de torneio inicia atividade" "battle" "$(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["activity"]["kind"])' 2>/dev/null)"
bun scripts/e2e-db.ts finish-activity "$PA" >/dev/null
R=$(curl -s -b "$JAR_A" "$BASE/api/game/state?playerId=$PA")
check "resultado do torneio é aplicado pelo state" "True" "$(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(any(x.get("result",{}).get("mode")=="tournament" or x.get("mode")=="tournament" for x in d.get("pendingResults",[])))' 2>/dev/null)"

echo ""
echo "=== EXT 7. CHAVES DO HORIZONTE E AETHELGARD ==="
KEYS=$(bun scripts/e2e-db.ts give-all-horizon-keys "$PA" 2>/dev/null | tail -1)
check "fixture reúne as 7 Chaves globais" "7" "$KEYS"
R=$(curl -s -b "$JAR_A" "$BASE/api/game/state?playerId=$PA")
check "estado reconhece 7 Chaves pela tabela global" "7" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["dragonBalls"])' 2>/dev/null)"
R=$(act "$JAR_A" "$PA" '"type":"wish","wishType":"riqueza"')
check "Bênção Primordial de Aethelgard concedida" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"
check "Convergência dispersa todas as Chaves" "0" "$(bun scripts/e2e-db.ts get-horizon-key-count "$PA" 2>/dev/null | tail -1)"

ENERGY_BEFORE=$(curl -s -b "$JAR_A" "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["energy"])' 2>/dev/null)
R=$(act "$JAR_A" "$PA" '"type":"search_dragon_ball","hours":1')
check "Busca pelas Chaves inicia atividade" "dragon_ball_search" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["activity"]["kind"])' 2>/dev/null)"
ENERGY_AFTER=$(curl -s -b "$JAR_A" "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys; print(json.load(sys.stdin)["player"]["energy"])' 2>/dev/null)
check "Busca pelas Chaves não gasta energia" "$ENERGY_BEFORE" "$ENERGY_AFTER"
R=$(act "$JAR_A" "$PA" '"type":"cancel_dragon_ball_search"')
check "Busca pode ser cancelada com segurança" "True" "$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["success"])' 2>/dev/null)"

echo ""
echo "=================================================="
echo "SMOKE ESTENDIDO: $PASS passaram / $FAIL falharam"
echo "=================================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
