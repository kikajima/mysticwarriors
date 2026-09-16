#!/bin/bash
# Bateria 1: registro + personagem (dado) + missão temporizada + treino + mestres + loja de treino
cd /home/z/my-project

# mata qualquer servidor residual na porta 3000
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2

# limpa estado do navegador de teste (recomeça do zero)
agent-browser storage local clear >/dev/null 2>&1

# sobe o dev server
bun run dev > /tmp/dev-test.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://localhost:3000/; then break; fi
  sleep 1
done
curl -s -o /dev/null -w "servidor: HTTP %{http_code}\n" http://localhost:3000/

ab() { agent-browser "$@" 2>&1; }

echo "=== 1. REGISTRAR CONTA ==="
ab open http://localhost:3000/
sleep 2
ab find role tab click --name "Criar conta"
sleep 0.5
ab find label "Usuário" fill "heroi_teste"
ab find label "Senha" fill "senha123"
ab find role button click --name "Criar minha conta"
sleep 2
echo "--- tela após registro (deve ser criação de personagem): ---"
ab snapshot -i -c | head -6

echo ""
echo "=== 2. DADO DE NOME ALEATÓRIO ==="
ab find role button click --name "Sortear nome aleatório de guerreiro"
sleep 1
NAME=$(agent-browser get value "#warrior-name" 2>/dev/null)
echo "nome sorteado: $NAME"

echo ""
echo "=== 3. CRIAR PERSONAGEM ==="
ab find role button click --name "Começar como Saiyajin"
sleep 3
echo "--- tela após criar (deve ser o jogo): ---"
ab snapshot -i -c | head -8

echo ""
echo "=== 4. ZENI DE TESTE ==="
PLAYER_ID=$(agent-browser storage local get gm_player_id 2>/dev/null | tail -1 | sed 's/gm_player_id: //')
echo "playerId: $PLAYER_ID"
cat > scripts/give-zeni.ts <<EOF
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  await db.player.update({ where: { id: '$PLAYER_ID' }, data: { zeni: 100000 } });
  const p = await db.player.findUnique({ where: { id: '$PLAYER_ID' } });
  console.log('zeni agora:', p?.zeni);
}
main().finally(() => db.\$disconnect());
EOF
bun run scripts/give-zeni.ts
ab reload
sleep 2.5

echo ""
echo "=== 5. MISSÃO TEMPORIZADA: INICIAR (3 min) ==="
ab find role button click --name "Missões"
sleep 1.5
ab find role button click --name "Iniciar missão (3 min)"
sleep 2.5
agent-browser get text "main" | grep -iE "⏳|em andamento|min" | head -4

echo ""
echo "=== 6. TREINO DE ATRIBUTO ==="
ab find role button click --name "Treino"
sleep 1.5
ab find role button click --name "Treinar +1"
sleep 2
agent-browser get text "main" | grep -iE "treino|força" | head -3

echo ""
echo "=== 7. MESTRE: APRENDER TÉCNICA (Kame — Rogafufuken 600z) ==="
ab find role button click --name "600 Zeni"
sleep 2.5
agent-browser get text "main" | grep -iE "orgulhoso|aprendeu|Rogafufuken|dominada" | head -4

echo ""
echo "=== 8. LOJA: COMPRAR BANDANA DE TREINO (Força +1) ==="
ab find role button click --name "Loja"
sleep 1.5
ab find role tab click --name "Treino"
sleep 1
ab find role button click --name "Instalar"
sleep 2
agent-browser get text "main" | grep -iE "instalado|bandana|treinos" | head -3

echo ""
echo "=== 9. TREINO COM BÔNUS (deve render +2) ==="
ab find role button click --name "Treino"
sleep 1.5
agent-browser get text "main" | grep -iE "rende \+|Treinar \+" | head -4
ab find role button click --name "Treinar +2"
sleep 2
agent-browser get text "main" | grep -iE "bônus de equipamento|→" | head -3

echo ""
echo "=== ERROS NO LOG DO SERVIDOR? ==="
grep -acE "Erro|500" /tmp/dev-test.log || echo "0 erros"

kill $SERVER_PID 2>/dev/null
echo "=== BATERIA 1 CONCLUÍDA ==="
