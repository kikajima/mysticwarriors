#!/usr/bin/env bash
# =====================================================================
# AUDITORIA E2E — RECURSOS NOVOS DA v0.3
#  * sexo (gender) na criação + validação
#  * avatar: URL validada (javascript:/data: bloqueadas) + upload com
#    magic bytes (arquivo falso rejeitado, PNG real aceito)
#  * rate-limit 60 req/min no GET /api/game/state (429)
#  * DELETE /api/game/character/:id (posse, último personagem)
#  * NOT_ACQUIRED ao ativar transformação não desbloqueada
#  * RequestDedup: requestId repetido não re-executa a ação
#  * activePlayerId: session devolve o personagem ativo; state sem
#    playerId resolve pelo servidor
# =====================================================================
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0

check() {
  local desc="$1" expected="$2" got="$3"
  if [ "$expected" = "$got" ]; then PASS=$((PASS+1)); echo "✓ $desc";
  else FAIL=$((FAIL+1)); echo "✗ FALHOU: $desc (esperado=$expected obtido=$got)"; fi
}

JAR=$(mktemp); JAR_RL=$(mktemp)
TS=$(date +%s)

echo "=== 1. SEXO (gender) NA CRIAÇÃO ==="

curl -s -c $JAR -X POST $BASE/api/auth/guest > /dev/null

# 1.1 criação com gender female
R=$(curl -s -b $JAR -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V3Malef$TS\",\"race\":\"majin\",\"gender\":\"female\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["gender"])' 2>/dev/null)
check "criação com gender=female salva female" "female" "$R"

# 1.2 default male quando ausente
R=$(curl -s -b $JAR -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V3Nomale$TS\",\"race\":\"humano\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["gender"])' 2>/dev/null)
check "ausência de gender → default male" "male" "$R"

# 1.3 gender inválido rejeitado
R=$(curl -s -b $JAR -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V3Inval$TS\",\"race\":\"humano\",\"gender\":\"x\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "gender inválido → VALIDATION_ERROR" "VALIDATION_ERROR" "$R"

echo ""
echo "=== 2. ACTIVE PLAYER (fim do localStorage) ==="

# 2.1 session devolve o activePlayerId (último criado)
R=$(curl -s -b $JAR $BASE/api/auth/session | python3 -c 'import json,sys;d=json.load(sys.stdin);print("ok" if d["activePlayerId"] and any(c["id"]==d["activePlayerId"] for c in d["characters"]) else "erro")' 2>/dev/null)
check "session devolve activePlayerId válido" "ok" "$R"

# 2.2 state SEM playerId resolve pelo activePlayerId do servidor
ACTIVE_NAME=$(curl -s -b $JAR $BASE/api/auth/session | python3 -c '
import json,sys
d = json.load(sys.stdin)
chars = [c for c in d["characters"] if c["id"] == d["activePlayerId"]]
print(chars[0]["name"] if chars else "")' 2>/dev/null)
R=$(curl -s -b $JAR "$BASE/api/game/state" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["player"]["name"] if d.get("player") else "null")' 2>/dev/null)
check "state sem playerId usa personagem ativo" "$ACTIVE_NAME" "$R"

echo ""
echo "=== 3. AVATAR: URL validada ==="

PID=$(curl -s -b $JAR $BASE/api/auth/session | python3 -c 'import json,sys;print(json.load(sys.stdin)["activePlayerId"])' 2>/dev/null)

# 3.1 URL de PÁGINA (não imagem) agora é rejeitada na hora — o servidor
# baixa e valida de verdade (espelha apenas imagens decodificáveis)
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"url\",\"url\":\"https://exemplo.com/minha-imagem.png\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "URL de página/inexistente → AVATAR_INVALID_URL (fetch+validação real)" "AVATAR_INVALID_URL" "$R"
# 3.1b imagem externa REAL é baixada, validada e ESPELHADA localmente
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"url\",\"url\":\"https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);u=d.get("avatarUrl") or "";print("ok" if u.startswith("/api/game/avatars/avatar_") else d.get("error",{}).get("code","erro"))' 2>/dev/null)
check "URL de imagem real → baixada, validada e espelhada localmente" "ok" "$R"

# 3.2 javascript: bloqueada
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"url\",\"url\":\"javascript:alert(1)\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "URL javascript: → AVATAR_INVALID_URL" "AVATAR_INVALID_URL" "$R"

# 3.3 data: bloqueada
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"url\",\"url\":\"data:text/html;base64,PHNjcmlwdD4=\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "URL data: → AVATAR_INVALID_URL" "AVATAR_INVALID_URL" "$R"

# 3.4 file: bloqueada
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"url\",\"url\":\"file:///etc/passwd\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "URL file: → AVATAR_INVALID_URL" "AVATAR_INVALID_URL" "$R"

# 3.5 URL não-URL rejeitada
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"url\",\"url\":\"nao sou uma url\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "URL malformada → AVATAR_INVALID_URL" "AVATAR_INVALID_URL" "$R"

echo ""
echo "=== 4. AVATAR: upload com magic bytes ==="

# 4.1 arquivo de TEXTO renomeado para .png → rejeitado (conteúdo != PNG)
echo "isto nao e uma imagem de verdade" > /tmp/fake-$TS.png
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -F "playerId=$PID" -F "type=upload" -F "file=@/tmp/fake-$TS.png;type=image/png" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "upload falso (texto como .png) → AVATAR_INVALID_TYPE" "AVATAR_INVALID_TYPE" "$R"

# 4.2 PNG real DECODIFICAVEL (8x8) -> aceito e servido pela rota persistente
python3 -c "import base64; open('/tmp/real-$TS.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGP4P9MYK2IYWhIACWtywZPdJPQAAAAASUVORK5CYII='))"
R=$(curl -s -b $JAR -X POST $BASE/api/game/avatar -F "playerId=$PID" -F "type=upload" -F "file=@/tmp/real-$TS.png;type=image/png" | python3 -c 'import json,sys;d=json.load(sys.stdin);u=d.get("avatarUrl") or "";print("ok" if u.startswith("/api/game/avatars/avatar_") else d)' 2>/dev/null)
check "upload PNG real → servido em /api/game/avatars/" "ok" "$R"

# 4.3 state reflete o avatarUrl
R=$(curl -s -b $JAR "$BASE/api/game/state?playerId=$PID" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("ok" if (d["player"]["avatarUrl"] or "").startswith("/api/game/avatars/") else "erro")' 2>/dev/null)
check "state devolve avatarUrl do upload" "ok" "$R"

# 4.4 DELETE remove o avatar
R=$(curl -s -b $JAR -X DELETE "$BASE/api/game/avatar?playerId=$PID" | python3 -c 'import json,sys;print(json.load(sys.stdin)["avatarUrl"])' 2>/dev/null)
check "DELETE avatar → null" "None" "$R"

echo ""
echo "=== 5. TRANSFORMAÇÃO NÃO ADQUIRIDA → NOT_ACQUIRED ==="

R=$(curl -s -b $JAR -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"activate_transformation\",\"transformationId\":\"majin_pura\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "ativar transformação não desbloqueada → NOT_ACQUIRED" "NOT_ACQUIRED" "$R"

echo ""
echo "=== 6. REQUEST DEDUP (idempotência anti-replay) ==="

# prepara: defesa baixa + zeni alto
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.player.update({ where: { id: '$PID' }, data: { zeni: 100000, defense: 5, energy: 500, hp: 99999 } });
await db.\$disconnect();
" 2>/dev/null

RID="dedup-teste-$TS-0001"
# 6.1 (v0.9) treino INSTANTÂNEO com requestId novo: executa na hora (sem atividade)
R1=$(curl -s -b $JAR -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"train\",\"stat\":\"defense\",\"requestId\":\"$RID\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(str(d.get("deduplicated", False)) + ":" + str(d.get("activity")) + ":" + str(d.get("player",{}).get("defense")))' 2>/dev/null)
check "treino instantâneo com requestId novo (dedup=False, sem atividade, def 5→6)" "False:None:6" "$R1"

# 6.2 MESMO requestId → resultado em cache (não re-executa: defesa segue 6)
R2=$(curl -s -b $JAR -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"train\",\"stat\":\"defense\",\"requestId\":\"$RID\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(str(d.get("deduplicated", False)) + ":" + str(d.get("player",{}).get("defense")))' 2>/dev/null)
check "replay do requestId → deduplicated=True (defesa segue 6, sem duplicar)" "True:6" "$R2"

# 6.3 requestId NOVO executa de novo (defesa 6→7 na hora)
R3=$(curl -s -b $JAR -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PID\",\"type\":\"train\",\"stat\":\"defense\",\"requestId\":\"$RID-2\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(str(d.get("deduplicated", False)) + ":" + str(d.get("player",{}).get("defense")))' 2>/dev/null)
check "requestId novo executa novo treino (defesa 6→7)" "False:7" "$R3"

echo ""
echo "=== 7. DELETE /api/game/character/:id ==="

# personagens atuais da conta: 2 (V3Malef + V3Nomale)
# 7.1 tentar deletar o personagem de OUTRA conta → 403
JAR_OTHER=$(mktemp)
curl -s -c $JAR_OTHER -X POST $BASE/api/auth/guest > /dev/null
R=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_OTHER -X DELETE "$BASE/api/game/character/$PID")
check "deletar personagem alheio → 403" "403" "$R"

# 7.2 v0.6: QUALQUER personagem pode ser excluído — inclusive o último.
# A conta sobrevive com 0 personagens e pode criar outro na sequência.
R=$(curl -s -b $JAR_OTHER -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"V3Unico$TS\",\"race\":\"androide\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
ONLY_PID=$R
R=$(curl -s -b $JAR_OTHER -X DELETE "$BASE/api/game/character/$ONLY_PID" | python3 -c 'import json,sys;print(json.load(sys.stdin)["message"])' 2>/dev/null)
check "deletar o ÚNICO personagem → permitido (v0.6)" "Personagem deletado." "$R"
R=$(curl -s -b $JAR_OTHER $BASE/api/auth/session | python3 -c 'import json,sys;d=json.load(sys.stdin);print("conta-viva" if d["account"] and len(d["characters"])==0 else "erro")' 2>/dev/null)
check "conta preservada com 0 personagens" "conta-viva" "$R"

# 7.3 deletar o segundo personagem da conta principal (funciona)
PID2=$(curl -s -b $JAR $BASE/api/auth/session | python3 -c "
import json,sys
d = json.load(sys.stdin)
chars = [c for c in d['characters'] if c['id'] != d['activePlayerId']]
print(chars[0]['id'] if chars else '')" 2>/dev/null)
R=$(curl -s -b $JAR -X DELETE "$BASE/api/game/character/$PID2" | python3 -c 'import json,sys;print(json.load(sys.stdin)["message"])' 2>/dev/null)
check "deletar personagem próprio (não-último) → ok" "Personagem deletado." "$R"

# 7.4 personagem realmente sumiu
R=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR "$BASE/api/game/state?playerId=$PID2")
check "personagem deletado → state 404" "404" "$R"

# 7.5 activePlayerId continua válido (não era o deletado)
R=$(curl -s -b $JAR "$BASE/api/game/state" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("ok" if d.get("player") else "erro")' 2>/dev/null)
check "personagem ativo intacto após delete" "ok" "$R"

echo ""
echo "=== 8. RATE-LIMIT do GET /api/game/state (60/min) ==="

# sessão DEDICADA para não contaminar os demais testes
curl -s -c $JAR_RL -X POST $BASE/api/auth/guest > /dev/null
LAST_CODE="200"
for i in $(seq 1 62); do
  LAST_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_RL "$BASE/api/game/state")
done
check "61ª+ chamada de state na mesma sessão → 429" "429" "$LAST_CODE"

echo ""
echo "==========================================="
echo "RESULTADO v0.3: $PASS passaram / $FAIL falharam"
echo "==========================================="

# limpeza
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const names = ['V3Malef$TS','V3Nomale$TS','V3Unico$TS'];
const players = await db.player.findMany({ where: { name: { in: names } }, select: { id: true } });
await db.player.deleteMany({ where: { id: { in: players.map(p => p.id) } } });
await db.account.deleteMany({ where: { username: null } });
await db.requestDedup.deleteMany({});
await db.\$disconnect();
console.log('limpo');
" 2>/dev/null

rm -f /tmp/fake-$TS.png /tmp/real-$TS.png $JAR $JAR_RL $JAR_OTHER
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
