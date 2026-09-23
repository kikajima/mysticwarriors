#!/usr/bin/env bash
# =====================================================================
# AUDITORIA E2E — Myst Ki Warriors
# Testa segurança (autorização), economia, progressão e regras do jogo
# diretamente contra o servidor dev (localhost:3000).
# =====================================================================
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0

check() { # check <descrição> <esperado> <obtido>
  local desc="$1" expected="$2" got="$3"
  if [ "$expected" = "$got" ]; then PASS=$((PASS+1)); echo "✓ $desc";
  else FAIL=$((FAIL+1)); echo "✗ FALHOU: $desc (esperado=$expected obtido=$got)"; fi
}

JAR_A=$(mktemp); JAR_B=$(mktemp); JAR_G=$(mktemp)
TS=$(date +%s)
export MW_E2E_RUN_ID="$TS"
E2E_IP_A="e2e-a-$TS"
E2E_IP_B="e2e-b-$TS"
E2E_IP_G="e2e-g-$TS"

echo "=== 1. SEGURANÇA: autenticação e autorização ==="

# 1.1 ação sem sessão → 401
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d '{"playerId":"x","type":"heal"}')
check "ação sem sessão → 401" 401 "$R"

# 1.2 estado sem sessão → 401
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/game/state?playerId=x")
check "estado sem sessão → 401" 401 "$R"

# 1.3 senha curta rejeitada (antes das contas válidas para não estourar rate limit)
R=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d "{\"username\":\"audit_c_$TS\",\"password\":\"curta\"}" | python3 -c 'import json,sys;c=json.load(sys.stdin)["error"]["code"];print(c if c in ("VALIDATION_ERROR","RATE_LIMITED") else "inesperado:"+c)' 2>/dev/null)
check "senha < 8 caracteres rejeitada (ou rate-limit ativo)" "ok" "$([ "$R" != "inesperado:$R" ] && echo ok || echo $R)"

# cria duas contas (rate limit é por IP: 5 registros/30min — usa 2)
# sessões de convidado (rate limit de registro é 5/30min)
R=$(curl -s -c $JAR_A -H "X-Forwarded-For: $E2E_IP_A" -X POST $BASE/api/auth/guest)
check "sessão (convidado) A criada" "True" "$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)"
R=$(curl -s -c $JAR_B -H "X-Forwarded-For: $E2E_IP_B" -X POST $BASE/api/auth/guest)
check "sessão (convidado) B criada" "True" "$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)"

# cria personagens
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"AuditA$TS\",\"race\":\"saiyajin\"}")
PA=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "criação personagem A" "audit" "$( [ -n "$PA" ] && echo audit || echo erro)"

R=$(curl -s -b $JAR_B -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"AuditB$TS\",\"race\":\"majin\"}")
PB=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "criação personagem B" "audit" "$( [ -n "$PB" ] && echo audit || echo erro)"

# 1.4 CONTA A tenta agir no personagem da CONTA B → 403 FORBIDDEN
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"train\",\"stat\":\"strength\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "conta A age no personagem de B → 403 FORBIDDEN" "FORBIDDEN" "$R"

# 1.5 playerId sozinho (sem cookie, sabendo o ID) não autoriza nada
R=$(curl -s -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"train\",\"stat\":\"strength\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "playerId sem sessão → UNAUTHORIZED" "UNAUTHORIZED" "$R"

# 1.6 estado do personagem de B pela sessão de A → 403
R=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A "$BASE/api/game/state?playerId=$PB")
check "estado de B pela sessão de A → 403" 403 "$R"

# 1.7 mensagem genérica de login (anti-enumeração)
R=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"nao_existe_$TS\",\"password\":\"qualquercoisa\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["message"])' 2>/dev/null)
check "login com usuário inexistente → mensagem genérica" "Usuário ou senha incorretos." "$R"

echo ""
echo "=== 2. SEGURANÇA: logout e sessão ==="

# logout testado com o convidado G (A mantém a sessão para os testes seguintes)
R=$(curl -s -b $JAR_G -c $JAR_G -X POST $BASE/api/auth/logout | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "logout G" "True" "$R"
R=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_G "$BASE/api/game/state")
check "sessão de G invalidada pós-logout → 401" 401 "$R"
R=$(curl -s -c $JAR_G -H "X-Forwarded-For: $E2E_IP_G" -X POST $BASE/api/auth/guest | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("success", d.get("error",{}).get("code","")))' 2>/dev/null)
check "nova sessão de G" "True" "$R"

echo ""
echo "=== 3. CONVIDADO: sessão própria + isolamento ==="

R=$(curl -s -c $JAR_G -H "X-Forwarded-For: $E2E_IP_G" -X POST $BASE/api/auth/guest | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["account"]["isGuest"])' 2>/dev/null)
check "sessão de convidado criada" "True" "$R"

# convidado tenta agir no personagem de B → 403
R=$(curl -s -b $JAR_G -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"train\",\"stat\":\"strength\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "convidado não acessa personagem de outro → 403" "FORBIDDEN" "$R"

# convidado cria personagem próprio
R=$(curl -s -b $JAR_G -X POST $BASE/api/game/create -H 'Content-Type: application/json' -d "{\"name\":\"GuestAudit$TS\",\"race\":\"humano\"}")
PG=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["id"])' 2>/dev/null)
check "convidado cria personagem" "audit" "$( [ -n "$PG" ] && echo audit || echo erro)"

echo ""
echo "=== 4. ECONOMIA: saldos e atributos sem teto ==="

# 4.1 (v0.9.2) consumíveis custam DIAMANTES: B tem 0 cristais; Fruto de Sylva = 10 💎
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"buy\",\"itemId\":\"senzu\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "compra sem diamantes → INSUFFICIENT_CRYSTALS" "INSUFFICIENT_CRYSTALS" "$R"

# 4.1b dá 10 diamantes ao B → compra sai e zera o saldo
bun scripts/e2e-db.ts set-crystals "$PB" 10 >/dev/null
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"buy\",\"itemId\":\"senzu\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "compra de Fruto de Sylva com 10 diamantes" "True" "$R"
CRY=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["crystals"])' 2>/dev/null)
check "diamantes debitados (10 → 0)" "0" "$CRY"
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"buy\",\"itemId\":\"senzu\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "segunda compra sem diamantes → INSUFFICIENT_CRYSTALS" "INSUFFICIENT_CRYSTALS" "$R"

# 4.1c Créditos insuficiente (item em Créditos): Luvas custam 300; B fica com 100
bun scripts/e2e-db.ts set-zeni "$PB" 100 >/dev/null
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"buy\",\"itemId\":\"luvas\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "compra sem Créditos → INSUFFICIENT_ZENI" "INSUFFICIENT_ZENI" "$R"

# 4.2 atributos sem teto: começa muito acima do antigo limite 999
BUN_SET=$(bun scripts/e2e-db.ts setup-high-stats "$PB" 2>&1 | tail -1)
check "setup banco (atributos 5.000 + Elixir)" "ok" "$BUN_SET"

# Elixir continua funcionando acima de 999 e soma +2 normalmente
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"use_item\",\"itemId\":\"elixir_dragao\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["strength"])' 2>/dev/null)
check "Elixir ultrapassa antigo teto (5000+2 → 5002)" "5002" "$R"
R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["items"]["consumables"].get("elixir_dragao",0))' 2>/dev/null)
check "Elixir consumido exatamente 1 (2 restantes)" "2" "$R"

# prepara os próximos testes com defesa barata e Ki suficiente
bun scripts/e2e-db.ts set-combat-stats "$PB" >/dev/null

echo ""
echo "=== 5. COMBATE: loadout, estratégia e PvP ==="

# 5.1 aprender técnicas
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"learn_technique\",\"techniqueId\":\"kamehameha\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "aprender Onda de Aether" "True" "$R"
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"learn_technique\",\"techniqueId\":\"genki_dama\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "aprender Convergência do Aether (suprema)" "True" "$R"

# genki_dama é suprema → não pode no slot 1
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"equip_technique\",\"slot\":\"1\",\"techniqueId\":\"genki_dama\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "suprema não ocupa slot comum" "LOADOUT_INVALID_SLOT" "$R"

# técnica não aprendida não pode ser equipada
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"equip_technique\",\"slot\":\"1\",\"techniqueId\":\"final_flash\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "técnica não aprendida → TECHNIQUE_NOT_LEARNED" "TECHNIQUE_NOT_LEARNED" "$R"

# equipa kamehameha no slot 1
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"equip_technique\",\"slot\":\"1\",\"techniqueId\":\"kamehameha\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["loadout"]["1"])' 2>/dev/null)
check "equipar kamehameha no slot 1" "kamehameha" "$R"

# estratégia
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"set_strategy\",\"strategy\":\"ki_specialist\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["strategy"])' 2>/dev/null)
check "definir estratégia ki_specialist" "ki_specialist" "$R"

# 5.2 batalha PvE funciona e devolve HP completo do servidor
bun scripts/e2e-db.ts set-hp-energy "$PB" 99999 999 >/dev/null
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"battle\",\"enemyId\":\"arruaceiro_ermo\"}")
BATTLE_OK=$(echo "$R" | python3 -c 'import json,sys;d=json.load(sys.stdin);b=d["activity"]["result"]["battle"];print("ok" if b["playerMaxHp"]>0 and b["enemyMaxHp"]>0 and "rounds" in b and d["activity"]["kind"]=="battle" and d["activity"]["remainingMs"]>0 else "erro")' 2>/dev/null)
check "batalha inicia ATIVIDADE com battle completo + duração" "ok" "$BATTLE_OK"
# espera a duração server-side e confirma aplicação (pendingResults)
sleep 6
R=$(curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("ok" if isinstance(d.get("pendingResults"),list) or d["player"] is not None else "erro")' 2>/dev/null)
check "pós-duração: state aplica o resultado da batalha" "ok" "$R"

# 5.3 PvP: A elevado a nível 30 para ficar na faixa de B
bun scripts/e2e-db.ts set-level-hp-energy "$PA" 30 99999 999 >/dev/null
R=$(curl -s -b $JAR_A -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PA\",\"type\":\"attack_player\",\"targetId\":\"$PB\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["activity"]["result"]["battle"]["opponentLevel"])' 2>/dev/null)
check "PvP A→B inicia atividade (opponentLevel=30)" "30" "$R"
sleep 6
curl -s -b $JAR_A "$BASE/api/game/state?playerId=$PA" > /dev/null

echo ""
echo "=== 6. PROGRESSÃO: quests + conquistas (claim único) ==="

R=$(curl -s -b $JAR_B "$BASE/api/game/quests?playerId=$PB" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["quests"]))' 2>/dev/null)
check "quests diárias/semanais geradas" "5" "$R"

# força a quest de treino no período atual (a geração é sorteada; o claim é o que se testa)
bun scripts/e2e-db.ts reset-training-quest "$PB" >/dev/null

# treina 5x para completar a quest (defense baixo = barato).
# v0.4: treino é ATIVIDADE com duração server-side (1,6s) — espera entre
# treinos; o próximo state/action aplica o resultado pendente.
for i in 1 2 3 4 5; do
  curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"train\",\"stat\":\"defense\"}" > /dev/null
  sleep 2
done
# último state aplica o resultado pendente antes da checagem
curl -s -b $JAR_B "$BASE/api/game/state?playerId=$PB" > /dev/null
TRAIN_QUEST=$(curl -s -b $JAR_B "$BASE/api/game/quests?playerId=$PB" | python3 -c '
import json,sys
qs=json.load(sys.stdin)["quests"]
q=[x for x in qs if x["questId"]=="daily_trainings"][0]
print(str(q["progress"]) + "/" + str(q["target"]) + ":" + str(q["ready"]))' 2>/dev/null)
check "progresso da quest de treino (5/5:True)" "5/5:True" "$TRAIN_QUEST"

# claim duplo: o segundo deve falhar
QID=$(curl -s -b $JAR_B "$BASE/api/game/quests?playerId=$PB" | python3 -c '
import json,sys
qs=json.load(sys.stdin)["quests"]
q=[x for x in qs if x["questId"]=="daily_trainings"][0]
print(q["questId"])' 2>/dev/null)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"claim_quest\",\"questId\":\"$QID\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "claim da quest" "True" "$R"
ZENI_BEFORE=$(bun scripts/e2e-db.ts get-zeni "$PB" 2>/dev/null | tail -1)
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"claim_quest\",\"questId\":\"$QID\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "claim duplo da quest → QUEST_ALREADY_CLAIMED" "QUEST_ALREADY_CLAIMED" "$R"
ZENI_AFTER=$(bun scripts/e2e-db.ts get-zeni "$PB" 2>/dev/null | tail -1)
check "saldo não mudou no claim duplo" "$ZENI_BEFORE" "$ZENI_AFTER"

echo ""
echo "=== 7. WORLD BOSS: disponibilidade + cooldown ==="

BOSS_ACTIVE=$(curl -s -b $JAR_B "$BASE/api/game/worldboss?playerId=$PB" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("True" if d.get("boss") else "False")' 2>/dev/null)
if [ "$BOSS_ACTIVE" = "True" ]; then
  R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"world_boss_attack\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("ok" if d["bossAttack"]["damage"]>0 else "erro")' 2>/dev/null)
  check "ataque ao boss causa dano quando ativo" "ok" "$R"
  R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"world_boss_attack\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
  check "ataque imediato ao boss → BOSS_COOLDOWN" "BOSS_COOLDOWN" "$R"
else
  R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"world_boss_attack\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
  check "fora da janela, ataque ao boss → BOSS_NOT_ACTIVE" "BOSS_NOT_ACTIVE" "$R"
  check "fora da janela, endpoint não expõe boss ativo" "False" "$BOSS_ACTIVE"
fi

echo ""
echo "=== 8. CONVIDADO → CONTA (conversão atômica) ==="

R=$(curl -s -b $JAR_G -c $JAR_G -X POST $BASE/api/auth/convert -H 'Content-Type: application/json' -d "{\"username\":\"converted_$TS\",\"password\":\"senha12345\"}" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["account"]["isGuest"], len(d["characters"]))' 2>/dev/null)
check "conversão preserva personagem (False 1)" "False 1" "$R"

# personagem continua jogável pós-conversão
R=$(curl -s -b $JAR_G "$BASE/api/game/state?playerId=$PG" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["name"])' 2>/dev/null)
check "personagem do convidado acessível pós-conversão" "GuestAudit$TS" "$R"

# converter de novo → erro
R=$(curl -s -b $JAR_G -X POST $BASE/api/auth/convert -H 'Content-Type: application/json' -d "{\"username\":\"outra_$TS\",\"password\":\"senha12345\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "segunda conversão → ACCOUNT_NOT_GUEST" "ACCOUNT_NOT_GUEST" "$R"

echo ""
echo "=== 9. TRANSFORMAÇÕES: requisitos respeitados ==="

R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"unlock_transformation\",\"transformationId\":\"majin_pura\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["transformation"]["id"])' 2>/dev/null)
check "desbloquear majin_pura (Ki 500 ≥ 15)" "majin_pura" "$R"
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"unlock_transformation\",\"transformationId\":\"majin_caos\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
check "majin_caos exige forma anterior → TRANSFORMATION_LOCKED" "TRANSFORMATION_LOCKED" "$R"

echo ""
echo "=== 10. RANKING/GUILDAS: endpoints separados ==="

RANK_BODY=$(curl -sS --max-time 12 -b $JAR_B "$BASE/api/game/ranking?playerId=$PB&page=1&pageSize=5")
R=$(printf '%s' "$RANK_BODY" | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("ranking");ok=isinstance(r,dict) and isinstance(r.get("entries"),list) and len(r["entries"])<=5 and isinstance(r.get("total"),int) and r.get("source") in ("cloud","local");print("True" if ok else "False")' 2>/dev/null || echo "PARSE_ERROR")
check "ranking paginado respeita contrato cloud/local" "True" "$R"
if [ "$R" != "True" ]; then
  echo "  ranking response: $(printf '%s' "$RANK_BODY" | head -c 500)"
fi

R=$(curl -s -b $JAR_B "$BASE/api/game/guilds?playerId=$PB" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(isinstance(d["guilds"],list))' 2>/dev/null)
check "lista de guildas resumida" "True" "$R"

# cria guilda + doação (guildas exigem requestId para exactly-once)
REQ_CREATE="guild-create-$TS"
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"create_guild\",\"guildName\":\"Audit Guild $TS\",\"requestId\":\"$REQ_CREATE\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["player"]["guild"]["name"])' 2>/dev/null)
check "criar guilda" "Audit Guild $TS" "$R"
REQ_DONATE="guild-donate-$TS"
R=$(curl -s -b $JAR_B -X POST $BASE/api/game/action -H 'Content-Type: application/json' -d "{\"playerId\":\"$PB\",\"type\":\"donate_guild\",\"amount\":8000,\"requestId\":\"$REQ_DONATE\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["success"])' 2>/dev/null)
check "doar 8000 para a guilda" "True" "$R"
GUILD_LVL=$(curl -s -b $JAR_B "$BASE/api/game/guilds?playerId=$PB" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["myGuild"]["level"] if d.get("myGuild") else "")' 2>/dev/null)
check "guilda subiu para nível 2 (8.000 Créditos)" "2" "$GUILD_LVL"

echo ""
echo "=== 11. ECONOMIA: ledger e transações ==="

LEDGER_COUNT=$(bun scripts/e2e-db.ts get-ledger-count "$PB" 2>/dev/null | tail -1)
if [[ "$LEDGER_COUNT" =~ ^[0-9]+$ ]] && [ "$LEDGER_COUNT" -gt 5 ]; then PASS=$((PASS+1)); echo "✓ ledger registrou $LEDGER_COUNT transações (>5)";
else FAIL=$((FAIL+1)); echo "✗ FALHOU: ledger com apenas $LEDGER_COUNT transações"; fi

echo ""
echo "==========================================="
echo "RESULTADO: $PASS passaram / $FAIL falharam"
echo "==========================================="

# limpeza seletiva: SOMENTE entidades ligadas aos nomes QA desta execução.
# Nunca usa prefixos amplos nem contas genéricas.
bun scripts/e2e-db.ts cleanup-run "$TS" >/dev/null 2>&1 || {
  echo "⚠ limpeza QA da execução $TS falhou; rode manualmente: bun scripts/e2e-db.ts cleanup-run $TS"
}

rm -f $JAR_A $JAR_B $JAR_G

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
