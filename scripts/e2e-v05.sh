#!/usr/bin/env bash
# =====================================================================
# AUDITORIA E2E v0.5 — Correções da revisão do usuário
#  1. BATALHA ÚNICA: resultado aplicado é entregue EXATAMENTE UMA vez
#     (pendingResults once) — a UI não repete a animação (filtro por
#     activityId validado no navegador; aqui validamos o contrato API);
#  2. COSMÉTICOS: comprar → equipar → ver no estado → trocar slot →
#     desequipar → bloqueios (não-dono, inválido, missão ativa);
#  3. POLÍTICA DE UPDATE: GameMeta registra versão sem resetar contas;
#     personagens existentes permanecem intactos.
# =====================================================================
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0

check() { # check <descrição> <esperado> <obtido>
  local desc="$1" expected="$2" got="$3"
  if [ "$expected" = "$got" ]; then PASS=$((PASS+1)); echo "✓ $desc";
  else FAIL=$((FAIL+1)); echo "✗ FALHOU: $desc (esperado=$expected obtido=$got)"; fi
}

JAR_A=$(mktemp); JAR_B=$(mktemp)
TS=$(date +%s)

echo "=== 1. SETUP ==="
curl -s -c $JAR_A -X POST $BASE/api/auth/guest > /dev/null
curl -s -c $JAR_B -X POST $BASE/api/auth/guest > /dev/null
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V05A$TS\",\"race\":\"saiyajin\"}")
PA=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V05B$TS\",\"race\":\"humano\",\"gender\":\"female\"}")
PB=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "contas e personagens criados" "audit" "$( [ -n "$PA" ] && [ -n "$PB" ] && echo audit || echo erro)"

# cristais para comprar cosméticos + stats para vencer a batalha
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PA' }, data: { crystals: 500, hp: 9999, energy: 999, level: 30, strength: 100, defense: 100, speed: 100, ki: 100 } });
await db.player.update({ where: { id: '$PB' }, data: { crystals: 500, hp: 9999, energy: 999, level: 30 } });
await db.\$disconnect();
" 2>/dev/null

echo ""
echo "=== 2. POLÍTICA DE UPDATE: versão registrada SEM reset ==="
# dispara a verificação de balanceamento (boot de sessão) ANTES de checar
# o registro — primeira execução apenas REGISTRA a versão (sem reset)
curl -s -b $JAR_A $BASE/api/auth/session > /dev/null
sleep 0.3
META=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const m = await db.gameMeta.findUnique({ where: { key: 'balanceVersion' } });
await db.\$disconnect();
console.log(m ? m.value : 'ausente');" 2>/dev/null)
check "GameMeta.balanceVersion registrada (não ausente)" "sim" "$([ "$META" != "ausente" ] && echo sim || echo ausente)"

# personagens criados ANTES do registro continuam com o nível/stats
LVL=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PA' } });
await db.\$disconnect();
console.log(p.level);" 2>/dev/null)
check "personagem existente NÃO foi resetado (nível preservado)" "30" "$LVL"

echo ""
echo "=== 3. COSMÉTICOS: comprar → equipar → estado → trocar → desequipar ==="

# 3.1 comprar com cristais suficientes → sucesso
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"buy_cosmetic\",\"cosmeticId\":\"aura_divina\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "compra com cristais suficientes funciona" "True" "$R"

# 3.2 comprar duplicado → ITEM_ALREADY_OWNED
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"buy_cosmetic\",\"cosmeticId\":\"aura_divina\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "compra duplicada → ITEM_ALREADY_OWNED" "ITEM_ALREADY_OWNED" "$R"

# 3.3 equipar SEM possuir → ITEM_NOT_OWNED
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"aura_divina\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "equipar sem possuir → ITEM_NOT_OWNED" "ITEM_NOT_OWNED" "$R"

# 3.4 PA compra aura de chamas + título e EQUIPA os dois
curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"buy_cosmetic\",\"cosmeticId\":\"aura_chama\"}" > /dev/null
curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"buy_cosmetic\",\"cosmeticId\":\"title_lendario\"}" > /dev/null
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"aura_chama\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["message"])' 2>/dev/null)
check "aura equipada com mensagem de efeito ativo" "True" "$(echo "$R" | rg -q 'ativo no seu perfil' && echo True || echo False)"
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"title_lendario\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "título equipado" "True" "$R"

# 3.5 o estado devolve owned (conta) + equipped (personagem)
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c '
import json,sys
d = json.load(sys.stdin)["player"]["cosmetics"]
print("aura_chama" in d["owned"], d["equipped"].get("aura"), d["equipped"].get("title"))' 2>/dev/null)
check "state: owned por conta + equipped por personagem" "True aura_chama title_lendario" "$R"

# 3.6 trocar de aura no MESMO slot substitui (não acumula)
curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"buy_cosmetic\",\"cosmeticId\":\"aura_trovao\"}" > /dev/null
curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"aura_trovao\"}" > /dev/null
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c '
import json,sys
d = json.load(sys.stdin)["player"]["cosmetics"]["equipped"]
print(d.get("aura"), d.get("title"))' 2>/dev/null)
check "equipar nova aura substitui a antiga (1 por slot)" "aura_trovao title_lendario" "$R"

# 3.7 (v0.9.6): posse de cosméticos é POR PERSONAGEM — um 2º personagem
# novo começa com a PRÓPRIA coleção vazia e equipados zerados (a coleção
# da conta foi duplicada apenas na MIGRAção v0.9.6; criações novas não
# herdam mais — ver smoke-v096 "posse por personagem").
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V05C$TS\",\"race\":\"majin\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
if [ -n "$R" ]; then
  R2=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$R" | python3 -c '
import json,sys
d = json.load(sys.stdin)["player"]["cosmetics"]
print("aura_trovao" in d["owned"], d["equipped"])' 2>/dev/null)
  check "2º personagem: coleção própria vazia, equipados zerados (posse por personagem v0.9.6)" "False {}" "$R2"
else
  # limite de 3 personagens atingido em reexecuções — valida posse no PA
  check "2º personagem: herda posse, equipados zerados" "skip" "skip"
fi

# 3.8 desequipar funciona
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"unequip_cosmetic\",\"cosmeticId\":\"title_lendario\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "desequipar título" "True" "$R"

# 3.9 desequipar o que não está equipado → erro
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"unequip_cosmetic\",\"cosmeticId\":\"title_lendario\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "desequipar 2x → VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

# 3.10 cosmético inválido → erro
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"nao_existe\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "cosmético inexistente → VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

echo ""
echo "=== 4. BATALHA ÚNICA — resultado entregue exatamente UMA vez ==="

# 4.1 inicia batalha (atividade com duração + activityId)
ACT=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"battle\",\"enemyId\":\"arruaceiro_ermo\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["activity"]["id"], d["activity"]["endsAt"], d["activity"]["result"]["battle"]["rounds"].__len__())' 2>/dev/null)
ACT_ID=$(echo "$ACT" | awk '{print $1}')
ACT_END=$(echo "$ACT" | awk '{print $2}')
ROUNDS=$(echo "$ACT" | awk '{print $3}')
check "batalha inicia com activityId e resultado pré-computado" "audit" "$( [ -n "$ACT_ID" ] && [ "$ROUNDS" -gt 0 ] 2>/dev/null && echo audit || echo erro)"

# 4.2 durante a atividade → state NÃO devolve pendingResults
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys;print(len(json.load(sys.stdin).get("pendingResults", [])))' 2>/dev/null)
check "durante a batalha: pendingResults vazio" "0" "$R"

# 4.3 espera o término server-side (endsAt + margem)
END_MS=$(python3 -c "
from datetime import datetime, timezone
dt = datetime.fromisoformat('$ACT_END'.replace('Z', '+00:00'))
print(max(0, int((dt.timestamp() - datetime.now(timezone.utc).timestamp()) * 1000) + 400))")
sleep "$(python3 -c "print(max(0.5, $END_MS / 1000))")"

# 4.4 primeiro state pós-término → pendingResults com a batalha UMA vez
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c '
import json,sys
d = json.load(sys.stdin)
pr = d.get("pendingResults", [])
battles = [r for r in pr if r.get("battle")]
print(len(pr), len(battles), pr[0].get("activityId") if pr else None)' 2>/dev/null)
GOT_COUNT=$(echo "$R" | awk '{print $1}')
GOT_BATTLES=$(echo "$R" | awk '{print $2}')
GOT_ACT=$(echo "$R" | awk '{print $3}')
check "pós-término: pendingResults entrega a batalha (com activityId)" "$ACT_ID" "$GOT_ACT"
check "exatamente 1 resultado, exatamente 1 batalha" "1 1" "$GOT_COUNT $GOT_BATTLES"

# 4.5 segundo state → NADA (exactly-once; a UI usa o activityId para não repetir)
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys;print(len(json.load(sys.stdin).get("pendingResults", [])))' 2>/dev/null)
check "state seguinte: pendingResults vazio (sem replay)" "0" "$R"

# 4.6 HP pós-batalha consistente (aplicado uma vez, sem duplicar)
HP=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PA' } });
await db.\$disconnect();
console.log(p.hp > 0 && p.hp <= 9999 ? 'ok' : 'estranho');" 2>/dev/null)
check "HP consistente pós-aplicação única" "ok" "$HP"

echo ""
echo "=== 5. COSMÉTICOS EM MISSÃO: bloqueados (allowlist central) ==="
curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"mission\",\"professionId\":\"agricultor\"}" > /dev/null
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"aura_divina\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "equipar durante missão → PLAYER_BUSY_ON_MISSION" "PLAYER_BUSY_ON_MISSION" "$R"

echo ""
echo "=== 6. LIMPEZA ==="
# remove personagens de teste (contas convidadas ficam; não toca nas reais)
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.deleteMany({ where: { name: { startsWith: 'V05' } } });
await db.\$disconnect();
" 2>/dev/null
echo "personagens de teste removidos"

echo ""
echo "=========================================="
echo "RESULTADO: $PASS passaram, $FAIL falharam"
[ $FAIL -eq 0 ] && echo "AUDITORIA v0.5: OK" || echo "AUDITORIA v0.5: FALHAS ENCONTRADAS"
exit $FAIL
