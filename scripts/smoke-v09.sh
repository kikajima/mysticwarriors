#!/bin/bash
# Smoke test v0.9 — treino instantâneo + profissão sem energia
set -e
JAR=$(mktemp)
BASE=http://localhost:3000

echo "== 1. sessão de convidado =="
GUEST=$(curl -s -c "$JAR" -X POST $BASE/api/auth/guest)
echo "$GUEST" | head -c 200; echo

echo "== 2. criar personagem =="
CREATE=$(curl -s -b "$JAR" -X POST $BASE/api/game/create -H 'Content-Type: application/json' \
  -d '{"name":"SmokeTest","race":"saiyajin","gender":"male","strategy":"balanced"}')
PID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['player']['id'])")
echo "playerId=$PID"

echo "== 3. TREINO instantâneo (força) =="
TRAIN=$(curl -s -b "$JAR" -X POST $BASE/api/game/action -H 'Content-Type: application/json' \
  -d "{\"playerId\":\"$PID\",\"requestId\":\"smoke-train-1\",\"type\":\"train\",\"stat\":\"strength\"}")
echo "$TRAIN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['player']
print('mensagem:', d['message'])
print('atividade no retorno (deve ser None):', d['activity'])
print('força:', p['strength'], '| energia:', p['energy'], '| zeni:', p['zeni'])
print('runningActivity (deve ser None):', p.get('runningActivity'))
assert d['activity'] is None, 'FALHOU: treino ainda cria atividade!'
assert p['strength'] > 10, 'FALHOU: força não subiu na hora!'
assert p['energy'] < 100, 'FALHOU: treino não gastou energia!'
print('OK: treino aplicado na hora, sem atividade, gastando energia.')
"

echo "== 4. energia em 0 para testar profissão SEM custo de energia =="
sqlite3 /home/z/my-project/db/custom.db "UPDATE Player SET energy=0 WHERE id='$PID';" 2>/dev/null || \
  python3 -c "
import sqlite3
c = sqlite3.connect('/home/z/my-project/db/custom.db')
c.execute(\"UPDATE Player SET energy=0 WHERE id=?\", ('$PID',))
c.commit()
"

echo "== 5. iniciar PROFISSÃO com energia 0 (antes dava erro) =="
PROF=$(curl -s -b "$JAR" -X POST $BASE/api/game/action -H 'Content-Type: application/json' \
  -d "{\"playerId\":\"$PID\",\"requestId\":\"smoke-prof-1\",\"type\":\"mission\",\"professionId\":\"agricultor\"}")
echo "$PROF" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['player']
print('mensagem:', d['message'])
print('energia (deve continuar 0):', p['energy'])
print('trabalho ativo:', p.get('activeMission'))
assert d.get('success', True) is not False, 'FALHOU: profissão foi recusada!'
assert p['energy'] == 0, 'FALHOU: profissão gastou energia!'
assert p.get('activeMission'), 'FALHOU: profissão não iniciou!'
print('OK: profissão iniciada com 0 de energia — sem custo de energia.')
"

echo "== 6. limpeza (remove personagem de teste) =="
curl -s -b "$JAR" -X DELETE $BASE/api/game/character/$PID -o /dev/null -w "delete:%{http_code}\n"
rm -f "$JAR"
echo "== SMOKE v0.9 CONCLUÍDO =="
