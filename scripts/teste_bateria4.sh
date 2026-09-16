#!/bin/bash
# Bateria 4: screenshots das telas novas para validação visual (desktop + mobile)
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2

bun run dev > /tmp/dev-test4.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://localhost:3000/; then break; fi
  sleep 1
done
curl -s -o /dev/null -w "servidor: HTTP %{http_code}\n" http://localhost:3000/

ab() { agent-browser "$@" 2>&1; }
mkdir -p /tmp/shots

echo "=== Screenshots DESKTOP (1280x720) ==="
ab set viewport 1280 720
ab open http://localhost:3000/
sleep 3

# entra com Mestre Akira (tem zeni, técnica e guilda)
ab find text "Mestre Akira" click
sleep 3

# Painel de guildas (com guilda criada)
ab find role button click --name "Guildas"
sleep 2.5
ab screenshot /tmp/shots/guildas-desktop.png

# Treino com mestres
ab find role button click --name "Treino"
sleep 2
ab scroll down 900
sleep 1
ab screenshot /tmp/shots/treino-mestres-desktop.png

# Missões: iniciar missão para capturar countdown
ab find role button click --name "Missões"
sleep 1.5
ab find role button click --name "Iniciar missão (3 min)"
sleep 2
ab screenshot /tmp/shots/missoes-countdown-desktop.png

# Loja: aba de treino
ab find role button click --name "Loja"
sleep 1.5
ab find role tab click --name "Treino"
sleep 1.5
ab screenshot /tmp/shots/loja-treino-desktop.png

echo ""
echo "=== Screenshots MOBILE (390x844, iPhone) ==="
ab set viewport 390 844
ab open http://localhost:3000/
sleep 3
ab find role button click --name "Menu do jogador"
sleep 1
ab screenshot /tmp/shots/menu-mobile.png
ab press Escape
sleep 0.5

# missões mobile (countdown ainda ativo)
ab find role button click --name "Missões"
sleep 1.5
ab screenshot /tmp/shots/missoes-mobile.png

# AuthGate mobile
ab find role button click --name "Menu do jogador"
sleep 1
ab find role menuitem click --name "Sair da conta"
sleep 2.5
ab screenshot /tmp/shots/authgate-mobile.png

# seleção de personagens mobile
ab find label "Usuário" fill "heroi_teste"
ab find label "Senha" fill "senha123"
ab find role button click --name "Entrar no universo"
sleep 2.5
ab screenshot /tmp/shots/select-mobile.png

ls -la /tmp/shots/
kill $SERVER_PID 2>/dev/null
echo "=== BATERIA 4 CONCLUÍDA ==="
