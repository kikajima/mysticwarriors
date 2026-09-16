#!/usr/bin/env bash
# =====================================================================
# AUDITORIA E2E v0.6 — Novidades do prompt do usuário
#  * Batalhas PvE/PvP gastam 3 de energia (cobrança atômica no início)
#  * Energia regenera a ~5 min/ponto (300s)
#  * Profissões: 5 opções, turno de 1h, recompensas por rank (300→1500),
#    promoções com bônus 1k/3k/9k/30k, XP % do nível
#  * Excluir QUALQUER personagem (inclusive o último) — conta preservada
#  * Cosméticos novos: aura pulsante (retrato) + aura do card (slot novo)
#  * Reset por BALANCE_VERSION 6 (personagens resetados, contas intactas)
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
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V06A$TS\",\"race\":\"saiyajin\"}")
PA=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V06B$TS\",\"race\":\"androide\"}")
PB=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "contas e personagens criados" "audit" "$( [ -n "$PA" ] && [ -n "$PB" ] && echo audit || echo erro)"

# recursos: A com energia exata para os testes de batalha; B normal
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PA' }, data: { zeni: 100000, hp: 99999, energy: 10, level: 5, strength: 40, defense: 40, speed: 40, ki: 40 } });
await db.player.update({ where: { id: '$PB' }, data: { zeni: 100000, hp: 99999, energy: 200, level: 5, strength: 40, defense: 40, speed: 40, ki: 40, crystals: 500 } });
await db.\$disconnect();
" 2>/dev/null

echo ""
echo "=== 2. BATALHAS GASTAM ENERGIA (v0.6) ==="

# 2.1 batalha PvE com energia registrada ANTES
E0=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["energy"])' 2>/dev/null)
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"battle\",\"enemyId\":\"saibaman\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "batalha PvE iniciada" "True" "$R"

# 2.2 energia caiu exatamente 3 no servidor
E1=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PA' } });
await db.\$disconnect();
console.log(p.energy);" 2>/dev/null)
check "energia debitada: 10 → 7 (custo 3)" "$((E0 - 3))" "$E1"

# 2.3 esperando a atividade terminar para liberar nova batalha
sleep 6

# 2.4 PvP também gasta 3
E0B=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PB' } });
await db.\$disconnect();
console.log(p.energy);" 2>/dev/null)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"attack_player\",\"targetId\":\"$PA\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "duelo PvP iniciado" "True" "$R"
E1B=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PB' } });
await db.\$disconnect();
console.log(p.energy);" 2>/dev/null)
check "PvP debitou 3 de energia" "$((E0B - 3))" "$E1B"

# 2.5 sem energia → INSUFFICIENT_ENERGY (zera a energia de A)
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PA' }, data: { energy: 2, hp: 99999 } });
await db.\$disconnect();
" 2>/dev/null
sleep 6
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"battle\",\"enemyId\":\"saibaman\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "batalha sem energia → INSUFFICIENT_ENERGY" "INSUFFICIENT_ENERGY" "$R"

echo ""
echo "=== 3. REGEN ~5 MIN POR PONTO (v0.6) ==="
# 3.1 o estado expõe o intervalo fracionário correto (300s base; androide B usa 300)
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys;print(int(json.load(sys.stdin)["player"]["regen"]["energyIntervalSec"]))' 2>/dev/null)
check "intervalo de energia = 300s (5 min)" "300" "$R"
# 3.2 humano teria ~272s (bônus 10%) — validado no unit test; aqui só o contrato do view

echo ""
echo "=== 4. PROFISSÕES (v0.6) ==="

# 4.1 lista as 5 profissões disponíveis via state (missions view usa mesmos campos)
R=$(bun -e "
import { PROFESSIONS } from './src/lib/game/content/world';
console.log(PROFESSIONS.length, PROFESSIONS.every(p => p.durationMin === 60) ? 'True' : 'False');" 2>/dev/null)
check "5 profissões com turno de 1h" "5 True" "$R"

# 4.2 B inicia turno de agricultor (v0.9: profissões NÃO gastam energia)
E0B=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PB' } });
await db.\$disconnect();
console.log(p.energy);" 2>/dev/null)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"mission\",\"professionId\":\"agricultor\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "turno de Agricultor iniciado" "True" "$R"
E1B=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PB' } });
await db.\$disconnect();
console.log(p.energy);" 2>/dev/null)
check "profissão NÃO gasta energia (v0.9 — fica igual)" "$E0B" "$E1B"

# 4.3 state expõe o turno ativo com o id da profissão
R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["activeMission"]["missionId"])' 2>/dev/null)
check "activeMission carrega a profissão" "agricultor" "$R"

# 4.4 claim antes do tempo → MISSION_NOT_READY
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"claim_mission\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "claim antes de 1h → MISSION_NOT_READY" "MISSION_NOT_READY" "$R"

# 4.5 adianta o turno no banco e coleta: rank 1 paga 300 (+5% androide = 315)
Z0=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PB' } });
await db.\$disconnect();
console.log(p.zeni);" 2>/dev/null)
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PB' }, data: { missionEndsAt: new Date(Date.now() - 60000) } });
await db.\$disconnect();" 2>/dev/null
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"claim_mission\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["missionResult"]["zeniGain"], d["player"]["professions"]["agricultor"]["rank"], d["player"]["professions"]["agricultor"]["completions"])' 2>/dev/null)
check "rank 1 pagou 315 Zeni (300 +5% androide) e registrou progresso 1/3" "315 1 1" "$R"
Z1=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PB' } });
await db.\$disconnect();
console.log(p.zeni);" 2>/dev/null)
check "Zeni creditado de fato (+315)" "$((Z0 + 315))" "$Z1"

# 4.6 XP do turno = 10% do XP do nível atual (nível 5 → 944*0.10)
XP_R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["xp"])' 2>/dev/null)
check "XP recebido pelo turno registrado (>= 1)" "sim" "$([ "$XP_R" -ge 1 ] 2>/dev/null && echo sim || echo nao)"

# 4.7 dois turnos depois → PROMOÇÃO com bônus de 1.000
for i in 1 2; do
  curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"mission\",\"professionId\":\"agricultor\"}" > /dev/null
  bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PB' }, data: { missionEndsAt: new Date(Date.now() - 60000) } });
await db.\$disconnect();" 2>/dev/null
  R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"claim_mission\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("PROMOVIDO" if "PROMOVIDO" in d["message"] else "sem-promocao")' 2>/dev/null)
done
check "3º turno concluído → PROMOVIDO (rank 2)" "PROMOVIDO" "$R"
R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;pr=json.load(sys.stdin)["player"]["professions"]["agricultor"];print(pr["rank"], pr["completions"])' 2>/dev/null)
check "progresso pós-promoção: rank 2, completions zeradas" "2 0" "$R"

# 4.8 salário do rank 2 = 450 (+5% = 472) — bônus de 1.000 já entrou no ledger
Z2=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PB' } });
await db.\$disconnect();
console.log(p.zeni);" 2>/dev/null)
# 315 x 3 turnos do rank 1 + 1000 de bônus de promoção (o turno de rank 2 ainda não ocorreu)
check "conta do Zeni fecha (3x315 + 1000 bônus = $((315*3 + 1000)))" "$((Z0 + 315*3 + 1000))" "$Z2"

echo ""
echo "=== 5. EXCLUIR QUALQUER PERSONAGEM (inclusive o último) ==="

# 5.1 A tem SÓ UM personagem — exclusão agora é permitida
R=$(curl -s -b $JAR_A -X DELETE "$BASE/api/game/character/$PA" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "exclusão do ÚNICO personagem permitida" "True" "$R"

# 5.2 a CONTA sobrevive (sessão válida, zero personagens)
R=$(curl -s -b $JAR_A $BASE/api/auth/session | python3 -c 'import json,sys;d=json.load(sys.stdin);print("conta-viva" if d["account"] and len(d["characters"])==0 else "erro")' 2>/dev/null)
check "conta preservada com 0 personagens" "conta-viva" "$R"

# 5.3 pode criar um novo personagem na mesma conta
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V06A2$TS\",\"race\":\"majin\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["race"])' 2>/dev/null)
check "novo personagem criado na mesma conta" "majin" "$R"

echo ""
echo "=== 6. COSMÉTICOS NOVOS (aura do retrato + aura do card) ==="

# 6.1 comprar Aura de Ki Pulsante (45 diamantes) e equipar
PA2=$(curl -s -b $JAR_A $BASE/api/auth/session | python3 -c 'import json,sys;print(json.load(sys.stdin)["characters"][0]["id"])' 2>/dev/null)
# personagem novo nasce com 0 diamantes — credita 500 para o teste de compra
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PA2' }, data: { crystals: 500 } });
await db.\$disconnect();" 2>/dev/null
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA2\",\"type\":\"buy_cosmetic\",\"cosmeticId\":\"aura_ki_pulsante\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "compra da Aura de Ki Pulsante" "True" "$R"
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA2\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"aura_ki_pulsante\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["cosmetics"]["equipped"]["aura"])' 2>/dev/null)
check "aura pulsante equipada (slot aura)" "aura_ki_pulsante" "$R"

# 6.2 comprar e equipar a Aura Ancestral do Card (slot NOVO 'card')
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA2\",\"type\":\"buy_cosmetic\",\"cosmeticId\":\"card_aura_ancestral\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "compra da Aura Ancestral do Card" "True" "$R"
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA2\",\"type\":\"equip_cosmetic\",\"cosmeticId\":\"card_aura_ancestral\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["cosmetics"]["equipped"]["card"])' 2>/dev/null)
check "aura do card equipada (slot card)" "card_aura_ancestral" "$R"

# 6.3 diamantes debitados (500 - 45 - 60 = 395)
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA2" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["crystals"])' 2>/dev/null)
check "diamantes debitados (500-45-60=395)" "395" "$R"

echo ""
echo "=== 7. XP VISÍVEL NO CONTRATO DO ESTADO ==="
R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;p=json.load(sys.stdin)["player"];print("ok" if p["xpToNext"]>0 and "xp" in p else "erro")' 2>/dev/null)
check "estado expõe xp e xpToNext (barra de XP)" "ok" "$R"

echo ""
echo "=============================================="
echo "RESULTADO: $PASS passaram, $FAIL falharam"
[ $FAIL -eq 0 ] && echo "E2E v0.6: TODOS OS TESTES PASSARAM ✓" || echo "E2E v0.6: HÁ FALHAS ✗"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
