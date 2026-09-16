#!/usr/bin/env bash
# =====================================================================
# Teste ponta a ponta do AVATAR NO SUPABASE STORAGE (v0.9.4)
# ---------------------------------------------------------------------
# Usa SÓ a chave publicável (igual o jogo). Verifica:
#   1. Conta de teste nova (signup público devolve sessão)
#   2. Upload na PRÓPRIA pasta  → deve FUNCIONAR (como o jogo faz)
#   3. URL pública sem login    → deve FUNCIONAR (200)
#   4. Pasta de OUTRO usuário   → deve ser BLOQUEADO
#   5. Upload sem login         → deve ser BLOQUEADO
#   6. Arquivo não-imagem       → deve ser BLOQUEADO
#
# Deixa na nuvem (disclosed ao dono, removíveis pelo painel):
#   * 1 conta probe.avatar.<timestamp>@gmail.com
#   * 1 PNG de ~95 bytes em avatars/{userId}/avatar-<ts>.png
# =====================================================================
set -u

SUPA_URL="https://rugbhzcmxmtmoqoxrhki.supabase.co"
SUPA_KEY="sb_publishable_pPxZG2kASZLr_mgv-1BNBg_dvfCN7-a"
TS=$(date +%s)
EMAIL="probe.avatar.${TS}@gmail.com"
PASS="SenhaTeste${TS}!x7"
TMP=/home/z/my-project/tool-results
mkdir -p "$TMP"

jsonget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))" 2>/dev/null; }

echo "===== 1) Criar conta de teste: $EMAIL ====="
SIGNUP=$(curl -s --max-time 20 -X POST "$SUPA_URL/auth/v1/signup" \
  -H "Content-Type: application/json" -H "apikey: $SUPA_KEY" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$SIGNUP" | jsonget access_token)
USER_ID=$(echo "$SIGNUP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('user',{}).get('id',''))" 2>/dev/null)
if [ -z "$TOKEN" ] || [ -z "$USER_ID" ]; then
  echo "FALHA no signup — resposta:"; echo "$SIGNUP" | head -c 600; echo; exit 1
fi
echo "OK — user_id: $USER_ID"

# PNG mínimo de 1x1 pixel (~95 bytes)
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" \
  | base64 -d > "$TMP/avatar-teste.png"
echo "nao sou imagem" > "$TMP/nao-imagem.txt"

echo
echo "===== 2) Upload na PRÓPRIA pasta (o caminho que o jogo usa) ====="
UP=$(curl -s -o "$TMP/st-up.json" -w "%{http_code}" --max-time 20 \
  -X POST "$SUPA_URL/storage/v1/object/avatars/$USER_ID/avatar-$TS.png" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMP/avatar-teste.png;type=image/png")
echo "→ HTTP $UP (esperado 200)"; head -c 300 "$TMP/st-up.json"; echo

echo
echo "===== 3) URL pública SEM login (qualquer visitante vê o avatar) ====="
PUB=$(curl -s -o /dev/null -w "%{http_code} (%{content_type})" --max-time 20 \
  "$SUPA_URL/storage/v1/object/public/avatars/$USER_ID/avatar-$TS.png")
echo "→ HTTP $PUB (esperado 200 image/png)"

echo
echo "===== 4) BLOQUEIO: upload na pasta de OUTRO usuário ====="
NEG=$(curl -s -o "$TMP/st-neg.json" -w "%{http_code}" --max-time 20 \
  -X POST "$SUPA_URL/storage/v1/object/avatars/00000000-0000-0000-0000-000000000000/roubo.png" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMP/avatar-teste.png;type=image/png")
echo "→ HTTP $NEG (esperado 4xx)"; head -c 300 "$TMP/st-neg.json"; echo

echo
echo "===== 5) BLOQUEIO: upload SEM login ====="
ANON=$(curl -s -o "$TMP/st-anon.json" -w "%{http_code}" --max-time 20 \
  -X POST "$SUPA_URL/storage/v1/object/avatars/$USER_ID/anon.png" \
  -H "apikey: $SUPA_KEY" \
  -F "file=@$TMP/avatar-teste.png;type=image/png")
echo "→ HTTP $ANON (esperado 4xx)"; head -c 300 "$TMP/st-anon.json"; echo

echo
echo "===== 6) BLOQUEIO: arquivo que NÃO é imagem ====="
TXT=$(curl -s -o "$TMP/st-txt.json" -w "%{http_code}" --max-time 20 \
  -X POST "$SUPA_URL/storage/v1/object/avatars/$USER_ID/avatar-$TS.txt" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMP/nao-imagem.txt;type=text/plain")
echo "→ HTTP $TXT (esperado 4xx)"; head -c 300 "$TMP/st-txt.json"; echo

echo
echo "==============================================================="
echo "Conta de teste criada (removível no painel em Authentication → Users):"
echo "  $EMAIL"
echo "Arquivo de teste deixado no bucket (removível em Storage → avatars):"
echo "  avatars/$USER_ID/avatar-$TS.png"
