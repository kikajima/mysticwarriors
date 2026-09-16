#!/bin/bash
# Bateria 3: menu de conta + troca de personagem + limite de 3 + logout/login + screenshots
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2

bun run dev > /tmp/dev-test3.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://localhost:3000/; then break; fi
  sleep 1
done
curl -s -o /dev/null -w "servidor: HTTP %{http_code}\n" http://localhost:3000/

ab() { agent-browser "$@" 2>&1; }

echo "=== 1. ENTRAR NO JOGO (sessão restaurada) ==="
ab open http://localhost:3000/
sleep 3
ab find role button click --name "Menu do jogador"
sleep 1.5
echo "--- menu deve ter opções de conta: ---"
ab snapshot -i -c | grep -iE "menuitem|conta" | head -5

echo ""
echo "=== 2. TROCAR DE PERSONAGEM ==="
ab find role menuitem click --name "Trocar de personagem"
sleep 2.5
echo "--- deve mostrar seleção (1 personagem + slot vazio): ---"
ab snapshot -i -c | head -10

echo ""
echo "=== 3. CRIAR 2º PERSONAGEM ==="
ab find role button click --name "Criar novo guerreiro"
sleep 1.5
ab find role button click --name "Sortear nome aleatório de guerreiro"
sleep 1
ab find role button click --name "Começar como Namekuseijin"
sleep 3
ab snapshot -i -c | head -4

echo ""
echo "=== 4. CRIAR 3º PERSONAGEM ==="
ab find role button click --name "Menu do jogador"
sleep 1
ab find role menuitem click --name "Trocar de personagem"
sleep 2.5
ab find role button click --name "Criar novo guerreiro"
sleep 1.5
ab find role button click --name "Sortear nome aleatório de guerreiro"
sleep 1
ab find role button click --name "Começar como Androide"
sleep 3
ab snapshot -i -c | head -4

echo ""
echo "=== 5. TENTATIVA DE 4º PERSONAGEM (não deve haver slot) ==="
ab find role button click --name "Menu do jogador"
sleep 1
ab find role menuitem click --name "Trocar de personagem"
sleep 2.5
echo "--- seleção com 3/3 e SEM slot de criação: ---"
ab snapshot -i -c | head -14
ab screenshot /tmp/select-3chars.png

echo ""
echo "=== 6. SAIR DA CONTA ==="
ab find role button click --name "Sair da conta"
sleep 2
echo "--- deve voltar ao login: ---"
ab snapshot -i -c | head -6

echo ""
echo "=== 7. LOGIN DE VOLTA ==="
ab find label "Usuário" fill "heroi_teste"
ab find label "Senha" fill "senha123"
ab find role button click --name "Entrar no universo"
sleep 2.5
echo "--- seleção com 3 personagens: ---"
ab snapshot -i -c | head -14

echo ""
echo "=== 8. ENTRAR COM O 2º PERSONAGEM ==="
ab find text "Namekuseijin" click
sleep 3
ab snapshot -i -c | head -5
ab screenshot /tmp/game-dashboard.png

echo ""
echo "=== VERIFICAÇÃO FINAL NO BANCO ==="
bun run scripts/check-db.ts 2>/dev/null | grep -A6 "CONTAS"

echo ""
echo "=== ERROS NO LOG DO SERVIDOR? ==="
grep -acE "Erro| 500 " /tmp/dev-test3.log || echo "0 erros"

kill $SERVER_PID 2>/dev/null
echo "=== BATERIA 3 CONCLUÍDA ==="
