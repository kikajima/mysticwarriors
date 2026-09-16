#!/bin/bash
# Smoke test v0.9.2 — LOJA EM DIAMANTES + UPLOAD otimizado no standalone
set -e
JAR=$(mktemp)
BASE=${BASE:-http://127.0.0.1:3100}

echo "== 1. convidado + personagem =="
curl -s -c "$JAR" -X POST $BASE/api/auth/guest -o /dev/null
CREATE=$(curl -s -b "$JAR" -X POST $BASE/api/game/create -H 'Content-Type: application/json' \
  -d '{"name":"SmokeV092","race":"saiyajin","gender":"male","strategy":"balanced"}')
PID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['player']['id'])")
echo "playerId=$PID"

echo "== 2. comprar Senzu SEM diamantes (0 💎) → deve recusar =="
R=$(curl -s -b "$JAR" -X POST $BASE/api/game/action -H 'Content-Type: application/json' \
  -d "{\"playerId\":\"$PID\",\"requestId\":\"v092-buy-01\",\"type\":\"buy\",\"itemId\":\"senzu\"}")
echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
code = d.get('error',{}).get('code')
print('código:', code)
assert code == 'INSUFFICIENT_CRYSTALS', 'FALHOU: esperava INSUFFICIENT_CRYSTALS'
print('OK: sem diamantes a compra é recusada.')
"

echo "== 3. dá 10 diamantes → Senzu sai por 10 e zera =="
python3 -c "
import sqlite3
c = sqlite3.connect('/home/z/my-project/.tmp-prod-test/data/custom.db')
c.execute(\"UPDATE Player SET crystals=10 WHERE id=?\", ('$PID',))
c.commit()
"
R=$(curl -s -b "$JAR" -X POST $BASE/api/game/action -H 'Content-Type: application/json' \
  -d "{\"playerId\":\"$PID\",\"requestId\":\"v092-buy-02\",\"type\":\"buy\",\"itemId\":\"senzu\"}")
echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['player']
print('mensagem:', d['message'])
print('diamantes:', p['crystals'], '| inventário:', p['items']['consumables'])
assert d.get('success', True) is not False, 'FALHOU: compra recusada!'
assert p['crystals'] == 0, 'FALHOU: diamantes não zeraram!'
assert p['items']['consumables'].get('senzu') == 1, 'FALHOU: senzu não entrou no inventário!'
print('OK: Senzu comprado por 10 diamantes.')
"

echo "== 4. Bandana de Treino por 15 💎 → treino de força rende +2 =="
python3 -c "
import sqlite3
c = sqlite3.connect('/home/z/my-project/.tmp-prod-test/data/custom.db')
c.execute(\"UPDATE Player SET crystals=15, energy=100, zeni=50000 WHERE id=?\", ('$PID',))
c.commit()
"
R=$(curl -s -b "$JAR" -X POST $BASE/api/game/action -H 'Content-Type: application/json' \
  -d "{\"playerId\":\"$PID\",\"requestId\":\"v092-buy-03\",\"type\":\"buy\",\"itemId\":\"bandana_treino\"}")
echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['player']
print('mensagem:', d['message'])
print('diamantes:', p['crystals'], '| owned:', p['items']['owned'])
assert d.get('success', True) is not False, 'FALHOU: compra recusada!'
assert p['crystals'] == 0, 'FALHOU: diamantes não zeraram!'
assert 'bandana_treino' in p['items']['owned'], 'FALHOU: bandana não foi instalada!'
print('OK: Bandana de Treino instalada por 15 diamantes.')
"
R=$(curl -s -b "$JAR" -X POST $BASE/api/game/action -H 'Content-Type: application/json' \
  -d "{\"playerId\":\"$PID\",\"requestId\":\"v092-buy-04\",\"type\":\"train\",\"stat\":\"strength\"}")
echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['player']
print('força:', p['strength'], '(10 base + 1 bandana + 1 treino = 12)')
assert p['strength'] == 12, 'FALHOU: treino não rendeu +2!'
print('OK: equipamento de treino em diamantes segue funcionando (+2 por treino).')
"

echo "== 5. upload de avatar (PNG teste) no standalone =="
python3 -c "
import struct, zlib
w = h = 64
raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))
def chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
open('/tmp/test-avatar.png','wb').write(png)
"
UP=$(curl -s -b "$JAR" -X POST $BASE/api/game/avatar -F "playerId=$PID" -F "type=upload" -F "file=@/tmp/test-avatar.png;type=image/png" -w "\n%{http_code}")
echo "$UP" | tail -1
echo "$UP" | head -1 | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('avatarUrl:', d.get('avatarUrl'))
assert d.get('success') is True, 'FALHOU: upload recusado!'
assert d.get('avatarUrl','').startswith('/api/game/avatars/'), 'FALHOU: URL inválida!'
print('OK: upload funciona no build de produção.')
"
AV=$(echo "$UP" | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['avatarUrl'])")
curl -s -o /dev/null -w "serving do avatar: %{http_code}\n" "$BASE$AV"

echo "== 6. tempos das ações (devem ser rápidos) =="
for i in 1 2 3; do
  curl -s -b "$JAR" -o /dev/null -w "train#$i: %{time_total}s\n" -X POST $BASE/api/game/action \
    -H 'Content-Type: application/json' \
    -d "{\"playerId\":\"$PID\",\"requestId\":\"v092-train-0$i\",\"type\":\"train\",\"stat\":\"defense\"}"
done

echo "== 7. limpeza =="
curl -s -b "$JAR" -X DELETE $BASE/api/game/character/$PID -o /dev/null -w "delete personagem: %{http_code}\n"
python3 -c "
import sqlite3
c = sqlite3.connect('/home/z/my-project/.tmp-prod-test/data/custom.db')
c.execute(\"DELETE FROM Session\")
c.execute(\"DELETE FROM Account WHERE username IS NULL AND isGuest=1\")
c.commit()
print('limpo')
"
rm -f "$JAR"
echo "== SMOKE v0.9.2 CONCLUÍDO =="