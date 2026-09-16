#!/bin/bash
# Diagnóstico v0.9.2 — mede o TEMPO de cada chamada relevante para a
# reclamação "coletar recompensas de missões e conquistas com delay grande".
set -e
JAR=$(mktemp)
BASE=http://localhost:3000

t() { # t <label> — mede o tempo do curl que vier em seguida via $CMD
  LABEL="$1"
}

echo "== 1. convidado + personagem =="
curl -s -c "$JAR" -X POST $BASE/api/auth/guest -o /dev/null
CREATE=$(curl -s -b "$JAR" -X POST $BASE/api/game/create -H 'Content-Type: application/json' \
  -d '{"name":"TimerTest","race":"saiyajin","gender":"male","strategy":"balanced"}')
PID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['player']['id'])")
echo "playerId=$PID"

echo
echo "== 2. tempos (curl time_total, 3 casas) =="

echo "-- POST train ×5 (aquece quests) --"
for i in 1 2 3 4 5; do
  curl -s -b "$JAR" -o /dev/null -w "train#$i: %{time_total}s\n" -X POST $BASE/api/game/action \
    -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$PID\",\"requestId\":\"timer-train-$i\",\"type\":\"train\",\"stat\":\"strength\"}"
done

echo "-- GET /api/game/state --"
curl -s -b "$JAR" -o /dev/null -w "state: %{time_total}s\n" "$BASE/api/game/state?playerId=$PID"

echo "-- GET /api/game/quests --"
curl -s -b "$JAR" -o /tmp/quests.json -w "quests: %{time_total}s\n" "$BASE/api/game/quests?playerId=$PID"

echo "-- GET /api/game/achievements --"
curl -s -b "$JAR" -o /tmp/ach.json -w "achievements: %{time_total}s\n" "$BASE/api/game/achievements?playerId=$PID"

echo
echo "== 3. quests prontas para coletar =="
python3 - <<'EOF'
import json
qs = json.load(open('/tmp/quests.json'))['quests']
ready = [q for q in qs if q.get('ready') and not q.get('claimed')]
for q in ready:
    print('READY:', q['questId'], q['name'], f"{q['progress']}/{q['target']}")
if not ready:
    print('(nenhuma quest pronta)')
EOF

CLAIM_Q=$(python3 - <<EOF
import json
qs = json.load(open('/tmp/quests.json'))['quests']
ready = [q for q in qs if q.get('ready') and not q.get('claimed')]
print(ready[0]['questId'] if ready else '')
EOF
)

if [ -n "$CLAIM_Q" ]; then
  echo "-- POST claim_quest ($CLAIM_Q) --"
  curl -s -b "$JAR" -o /tmp/claim_q.json -w "claim_quest: %{time_total}s\n" -X POST $BASE/api/game/action \
    -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$PID\",\"requestId\":\"timer-cq-1\",\"type\":\"claim_quest\",\"questId\":\"$CLAIM_Q\"}"
  python3 -c "import json; d=json.load(open('/tmp/claim_q.json')); print('resposta:', d.get('message') or d.get('error'))"
fi

echo
echo "== 4. conquistas desbloqueadas e não coletadas =="
python3 - <<'EOF'
import json
ach = json.load(open('/tmp/ach.json'))['achievements']
unlocked = [a for a in ach if a.get('unlocked') and not a.get('claimed')]
for a in unlocked:
    print('UNLOCKED:', a['achievementId'], a['name'])
if not unlocked:
    print('(nenhuma conquista desbloqueada)')
EOF

CLAIM_A=$(python3 - <<EOF
import json
ach = json.load(open('/tmp/ach.json'))['achievements']
unlocked = [a for a in ach if a.get('unlocked') and not a.get('claimed')]
print(unlocked[0]['achievementId'] if unlocked else '')
EOF
)

if [ -n "$CLAIM_A" ]; then
  echo "-- POST claim_achievement ($CLAIM_A) --"
  curl -s -b "$JAR" -o /tmp/claim_a.json -w "claim_achievement: %{time_total}s\n" -X POST $BASE/api/game/action \
    -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$PID\",\"requestId\":\"timer-ca-1\",\"type\":\"claim_achievement\",\"achievementId\":\"$CLAIM_A\"}"
  python3 -c "import json; d=json.load(open('/tmp/claim_a.json')); print('resposta:', d.get('message') or d.get('error'))"
fi

echo
echo "== 5. teste do UPLOAD de avatar (imagem PNG de teste gerada localmente) =="
python3 -c "
import struct, zlib
# PNG 64x64 vermelho válido e mínimo
w = h = 64
raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))
def chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw))
png += chunk(b'IEND', b'')
open('/tmp/test-avatar.png','wb').write(png)
print('png de teste:', len(png), 'bytes')
"
curl -s -b "$JAR" -o /tmp/upload.json -w "upload: %{time_total}s (http %{http_code})\n" -X POST $BASE/api/game/avatar \
  -F "playerId=$PID" -F "type=upload" -F "file=@/tmp/test-avatar.png;type=image/png"
cat /tmp/upload.json | head -c 400; echo

AVATAR_URL=$(python3 -c "import json; print(json.load(open('/tmp/upload.json')).get('avatarUrl',''))" 2>/dev/null || echo "")
if [ -n "$AVATAR_URL" ]; then
  echo "-- GET $AVATAR_URL (serving) --"
  curl -s -o /dev/null -w "avatar GET: %{time_total}s (http %{http_code})\n" "$BASE$AVATAR_URL"
fi

echo
echo "== 6. limpeza =="
curl -s -b "$JAR" -X DELETE $BASE/api/game/character/$PID -o /dev/null -w "delete personagem: %{http_code}\n"
rm -f "$JAR"
echo "== FIM =="