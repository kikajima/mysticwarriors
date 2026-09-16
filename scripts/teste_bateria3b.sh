#!/bin/bash
# Bateria 3b: criação de personagens com raça selecionada + limite 3 + logout/login
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2

bun run dev > /tmp/dev-test3b.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://localhost:3000/; then break; fi
  sleep 1
done
curl -s -o /dev/null -w "servidor: HTTP %{http_code}\n" http://localhost:3000/

ab() { agent-browser "$@" 2>&1; }

echo "=== 1. RESET: LOGIN DETERMINÍSTICO ==="
ab storage local clear
ab open http://localhost:3000/
sleep 2.5
ab find label "Usuário" fill "heroi_teste"
ab find label "Senha" fill "senha123"
ab find role button click --name "Entrar no universo"
sleep 2.5
echo "--- seleção com 1 personagem: ---"
ab snapshot -i -c | head -7

echo ""
echo "=== 2. CRIAR 2º PERSONAGEM (Namekuseijin) ==="
ab find role button click --name "Criar novo guerreiro"
sleep 1.5
ab find role button click --name "Sortear nome aleatório de guerreiro"
sleep 1
NOME2=$(agent-browser get value "#warrior-name" 2>/dev/null)
echo "nome 2: $NOME2"
ab find text "Sábios dragões de Namekusei" click
sleep 1
ab find role button click --name "Começar como Namekuseijin"
sleep 3
echo "--- após criar (deve ser o jogo): ---"
ab snapshot -i -c | head -5

echo ""
echo "=== 3. CRIAR 3º PERSONAGEM (Androide) ==="
ab find role button click --name "Menu do jogador"
sleep 1
ab find role menuitem click --name "Trocar de personagem"
sleep 2.5
ab find role button click --name "Criar novo guerreiro"
sleep 1.5
ab find role button click --name "Sortear nome aleatório de guerreiro"
sleep 1
NOME3=$(agent-browser get value "#warrior-name" 2>/dev/null)
echo "nome 3: $NOME3"
ab find text "Máquinas de destruição perfeitas" click
sleep 1
ab find role button click --name "Começar como Androide"
sleep 3
ab snapshot -i -c | head -5

echo ""
echo "=== 4. LIMITE: 3/3 SEM SLOT DE CRIAÇÃO ==="
ab find role button click --name "Menu do jogador"
sleep 1
ab find role menuitem click --name "Trocar de personagem"
sleep 2.5
echo "--- seleção final: ---"
ab snapshot -i -c | grep -E "button|heading" | head -12
COUNT_CREATE=$(agent-browser get count "button:has-text('Criar novo guerreiro')" 2>/dev/null | tail -1)
echo "botões de criar novo: $COUNT_CREATE (esperado: 0)"
ab screenshot /tmp/select-3chars.png

echo ""
echo "=== 5. SAIR DA CONTA ==="
ab find role button click --name "Sair da conta"
sleep 2
echo "--- deve voltar ao AuthGate: ---"
ab snapshot -i -c | head -6

echo ""
echo "=== 6. LOGIN DE VOLTA + ENTRAR COM 2º PERSONAGEM ==="
ab find label "Usuário" fill "heroi_teste"
ab find label "Senha" fill "senha123"
ab find role button click --name "Entrar no universo"
sleep 2.5
ab find text "$NOME2" click
sleep 3
echo "--- dashboard do 2º personagem: ---"
agent-browser get text "main" | head -6
ab screenshot /tmp/game-dashboard.png

echo ""
echo "=== VERIFICAÇÃO NO BANCO ==="
bun run scripts/check-db.ts 2>/dev/null | grep -A4 "CONTAS"

echo ""
echo "=== ERROS NO LOG? ==="
grep -acE "Erro| 500 " /tmp/dev-test3b.log || echo "0 erros"

kill $SERVER_PID 2>/dev/null
echo "=== BATERIA 3B CONCLUÍDA ==="
