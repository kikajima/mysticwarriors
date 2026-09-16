#!/usr/bin/env bash
# =====================================================================
# AUDITORIA E2E v0.4 — Novidades da revisão
#  * Atividades server-side (treino/batalha com duração + resume)
#  * Missão: allowlist completa (bloqueio ampliado) + PvP em alvo ocupado
#    (v0.9.20: vítima NUNCA é protegida por estar ocupada)
#  * Avatar: upload real + serving persistente + URL espelhada (SSRF off)
#  * Farm livre (recompensa não decai com volume)
#  * Elixir com preço dinâmico
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
# usa sessões de CONVIDADO (rate limit de registro é 5/30min — os testes
# rodam várias vezes durante o desenvolvimento)
curl -s -c $JAR_A -X POST $BASE/api/auth/guest > /dev/null
curl -s -c $JAR_B -X POST $BASE/api/auth/guest > /dev/null
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V04A$TS\",\"race\":\"saiyajin\"}")
PA=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V04B$TS\",\"race\":\"humano\",\"gender\":\"female\"}")
PB=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "contas e personagens criados" "audit" "$( [ -n "$PA" ] && [ -n "$PB" ] && echo audit || echo erro)"

# recursos para os testes
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PA' }, data: { zeni: 5000000, hp: 99999, energy: 999, level: 30, strength: 100, defense: 100, speed: 100, ki: 100 } });
await db.player.update({ where: { id: '$PB' }, data: { zeni: 500000, hp: 99999, energy: 999, level: 30 } });
await db.\$disconnect();
" 2>/dev/null

echo ""
echo "=== 2. ATIVIDADES SERVER-SIDE (treino instantâneo v0.9 + batalha) ==="

# 2.1 (v0.9) TREINO INSTANTÂNEO: sem atividade, atributo aplicado na hora
ZENI_START=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PA' } });
await db.\$disconnect();
console.log(p.zeni);" 2>/dev/null)
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"train\",\"stat\":\"strength\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);p=d["player"];print("força", p["strength"], "| atividade", d["activity"])' 2>/dev/null)
check "treino instantâneo: força 100→101 sem atividade" "força 101 | atividade None" "$R"

# 2.2 custo debitado exatamente uma vez
ZENI_POS=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PA' } });
await db.\$disconnect();
console.log(p.zeni);" 2>/dev/null)
CUSTO=$(python3 -c "print(int(20*1.05**90))")
ZENI_ESPERADO=$(python3 -c "print(int($ZENI_START - $CUSTO))")
check "custo do treino debitado uma vez" "$ZENI_ESPERADO" "$ZENI_POS"

# 2.3 treinos consecutivos funcionam (sem bloqueio de atividade p/ treino)
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"train\",\"stat\":\"strength\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["player"]["strength"])' 2>/dev/null)
check "segundo treino consecutivo → força 102" "102" "$R"

# 2.4 energia: o valor visível respeita o TETO derivado (nível 30 → max
# menor que os 999 cravados no banco; a API clampa ao ler)
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys;p=json.load(sys.stdin)["player"];print(p["energy"]==p["derived"]["maxEnergy"])' 2>/dev/null)
check "energia visível respeita o teto derivado (clamp)" "True" "$R"

# 2.6 batalha PvE como atividade + aplicação pós-duração
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"battle\",\"enemyId\":\"saibaman\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["activity"]["result"]["battle"]["enemyName"])' 2>/dev/null)
check "batalha PvE inicia com battle no result" "Saibaman Verde" "$R"
sleep 6
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c '
import json,sys
d=json.load(sys.stdin)
pr=d.get("pendingResults") or []
ok = any(r.get("kind")=="battle" for r in pr) and d["player"]["battlesWon"]>=1
print("ok" if ok else "erro")' 2>/dev/null)
check "pós-duração: batalha aplicada (vitória contabilizada)" "ok" "$R"

echo ""
echo "=== 3. FARM LIVRE (sem penalidade diária) ==="

# 3.1 três batalhas seguidas: recompensas constantes (não decaem)
ZENI_1=-1; ZENI_2=-1; ZENI_3=-1
for i in 1 2 3; do
  curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"battle\",\"enemyId\":\"saibaman\"}" > /dev/null
  sleep 6
  curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" > /dev/null
done
# as recompensas variam só pelo rand 0.9-1.15 — verifica que nenhuma foi
# reduzida por faixa (o antigo tier de 50% não existe mais)
R=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const txs = await db.walletTransaction.findMany({
  where: { playerId: '$PA', source: 'pve', type: 'reward' },
  orderBy: { createdAt: 'asc' },
});
await db.\$disconnect();
const amounts = txs.map(t => t.amount).filter(a => a > 0);
// saibaman: 70 zeni base × rand(0.9-1.15) → todas devem estar >= 63 (70*0.9)
const todasIntegrais = amounts.length >= 4 && amounts.every(a => a >= 63);
console.log(todasIntegrais ? 'integral' : 'reduzida:' + JSON.stringify(amounts));" 2>/dev/null)
check "4+ batalhas no dia: TODAS com recompensa integral (≥63 zeni)" "integral" "$R"

echo ""
echo "=== 4. MISSÃO: allowlist + PvP em alvo ocupado (v0.9.20) ==="

# 4.1 B inicia turno de profissão (agricultor: 1h)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"mission\",\"professionId\":\"agricultor\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "B inicia missão" "True" "$R"

# 4.2 v0.9.20 — A ataca B (ALVO em missão) → LIBERADO: a vítima nunca é
# protegida por estar ocupada; o combate processa por completo
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"attack_player\",\"targetId\":\"$PB\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["success"], "activity" in d and d["activity"] is not None)' 2>/dev/null)
check "PvP contra alvo em missão → LIBERADO (vítima atacável)" "True True" "$R"

# 4.2.1 o turno de B segue intacto após ser atacado (ser vítima não cancela)
R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["activeMission"]["missionId"])' 2>/dev/null)
check "turno de profissão de B segue ativo após ser atacado" "agricultor" "$R"

# 4.2.2 ATACANTE ocupado continua BLOQUEADO (sem regressão): B em missão
# tenta atacar A → PLAYER_BUSY_ON_MISSION
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"attack_player\",\"targetId\":\"$PA\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "atacante em missão → PLAYER_BUSY_ON_MISSION (sem regressão)" "PLAYER_BUSY_ON_MISSION" "$R"

# 4.3 B tenta comprar durante missão → bloqueado (allowlist ampla)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"buy\",\"itemId\":\"senzu\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "compra durante missão → PLAYER_BUSY_ON_MISSION" "PLAYER_BUSY_ON_MISSION" "$R"

# 4.4 B tenta curar durante missão → bloqueado
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"heal\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "cura durante missão → PLAYER_BUSY_ON_MISSION" "PLAYER_BUSY_ON_MISSION" "$R"

# 4.5 World Boss LIBERADO durante missão (exceção)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"world_boss_attack\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("ok" if d["bossAttack"]["damage"]>0 else "erro")' 2>/dev/null)
check "World Boss LIBERADO durante missão" "ok" "$R"

# 4.6 missão intacta após atacar o boss (não cancela/encurta)
R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["activeMission"]["missionId"])' 2>/dev/null)
check "turno de profissão continua ativo após ataque ao boss" "agricultor" "$R"

echo ""
echo "=== 5. AVATAR: armazenamento persistente + validação real ==="

# 5.1 gera PNG válido de verdade (decodificável)
PNG=$(mktemp --suffix=.png)
python3 -c "
import struct, zlib
def chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)
raw = b''.join(b'\x00' + b'\xff\x99\x33' * 8 for _ in range(8))
idat = zlib.compress(raw)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
open('$PNG', 'wb').write(png)
"
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/avatar -F "playerId=$PA" -F "type=upload" -F "file=@$PNG;type=image/png" | python3 -c 'import json,sys;print(json.load(sys.stdin)["avatarUrl"])' 2>/dev/null)
check "upload PNG real → servido via /api/game/avatars/" "/api/game/avatars/" "$(echo "$R" | grep -o '^/api/game/avatars/' | head -1)"

# 5.2 a URL servida responde 200 com content-type correto
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$R")
check "avatar servido com 200" "200" "$R"

# 5.3 arquivo falso (texto como .png) → rejeitado, avatar anterior intacto
FAKE=$(mktemp --suffix=.png); echo "isto nao e uma imagem" > $FAKE
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/avatar -F "playerId=$PA" -F "type=upload" -F "file=@$FAKE;type=image/png" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "arquivo falso → AVATAR_INVALID_TYPE" "AVATAR_INVALID_TYPE" "$R"
R=$(curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["avatarUrl"])' 2>/dev/null)
check "avatar anterior PRESERVADO após falha" "/api/game/avatars/" "$(echo "$R" | grep -o '^/api/game/avatars/' | head -1)"

# 5.4 URL externa de PÁGINA (não imagem) → rejeitada com mensagem clara
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"url\",\"url\":\"https://example.com/\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["error"]["code"])' 2>/dev/null)
check "URL de página (não imagem) rejeitada" "AVATAR_INVALID_URL" "$R"

# 5.5 URL com IP privado → bloqueada (anti-SSRF)
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"url\",\"url\":\"https://127.0.0.1/x.png\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "URL com IP interno → AVATAR_INVALID_URL (anti-SSRF)" "AVATAR_INVALID_URL" "$R"

# 5.6 URL http (não https) → rejeitada com orientação
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"url\",\"url\":\"http://example.com/imagem.png\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "URL http → rejeitada (use HTTPS)" "AVATAR_INVALID_URL" "$R"

# 5.7 DELETE remove e volta ao retrato da raça
R=$(curl -s -b $JAR_A -X DELETE "$BASE/api/game/avatar?playerId=$PA" | python3 -c 'import json,sys;print(json.load(sys.stdin)["avatarUrl"])' 2>/dev/null)
check "DELETE remove avatar (null)" "None" "$R"

echo ""
echo "=== 6. ELIXIR com preço fixo em DIAMANTES (v0.9.2) ==="

# 6.1 sem diamantes → recusado
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"buy\",\"itemId\":\"elixir_dragao\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "elixir sem diamantes → INSUFFICIENT_CRYSTALS" "INSUFFICIENT_CRYSTALS" "$R"

# 6.2 dá 100 diamantes → compra sai e debita exatamente 75
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PA' }, data: { crystals: 100, items: JSON.stringify({weapon:null,armor:null,accessory:null,owned:[],consumables:{}}) } });
await db.\$disconnect();" 2>/dev/null
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"buy\",\"itemId\":\"elixir_dragao\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "compra de elixir com 100 diamantes" "True" "$R"
CRY_DEPOIS=$(bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const p = await db.player.findUnique({ where: { id: '$PA' } });
await db.\$disconnect();
console.log(p.crystals);" 2>/dev/null)
check "elixir custa exatamente 75 diamantes (100→25)" "25" "$CRY_DEPOIS"

# 6.3 tentativa com 25 diamantes → recusada (falta 50)
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"buy\",\"itemId\":\"elixir_dragao\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "elixir com 25 diamantes → INSUFFICIENT_CRYSTALS" "INSUFFICIENT_CRYSTALS" "$R"

echo ""
echo "==========================================="
echo "RESULTADO: $PASS passaram / $FAIL falharam"
echo "==========================================="

# limpeza
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const ids = (await db.player.findMany({ where: { name: { in: ['V04A$TS','V04B$TS'] } }, select: { accountId: true } })).map(p => p.accountId).filter(Boolean);
await db.player.deleteMany({ where: { name: { in: ['V04A$TS','V04B$TS'] } } });
await db.account.deleteMany({ where: { id: { in: ids } } });
await db.\$disconnect();
console.log('cleanup ok');" 2>/dev/null

rm -f $JAR_A $JAR_B $PNG $FAKE
