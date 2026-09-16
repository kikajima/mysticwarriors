#!/bin/bash
# Bateria 2: coletar missão + guilda + batalha c/ técnica + troca de personagem + limite 3 + logout/login
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2

bun run dev > /tmp/dev-test2.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://localhost:3000/; then break; fi
  sleep 1
done
curl -s -o /dev/null -w "servidor: HTTP %{http_code}\n" http://localhost:3000/

ab() { agent-browser "$@" 2>&1; }

echo "=== 1. ABRIR JOGO (deve entrar direto no personagem salvo) ==="
ab open http://localhost:3000/
sleep 2.5
ab snapshot -i -c | head -5

echo ""
echo "=== 2. ADIANTAR MISSÃO NO BANCO (para testar coleta) ==="
PLAYER_ID=$(agent-browser storage local get gm_player_id 2>/dev/null | tail -1 | sed 's/gm_player_id: //')
cat > scripts/finish-mission.ts <<EOF
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const p = await db.player.findUnique({ where: { id: '$PLAYER_ID' } });
  console.log('missão ativa:', p?.missionId, 'termina em:', p?.missionEndsAt?.toISOString());
  await db.player.update({
    where: { id: '$PLAYER_ID' },
    data: { missionEndsAt: new Date(Date.now() - 60000) },
  });
  console.log('missão adiantada para o passado');
}
main().finally(() => db.\$disconnect());
EOF
bun run scripts/finish-mission.ts
ab reload
sleep 2.5

echo ""
echo "=== 3. COLETAR RECOMPENSA DA MISSÃO ==="
ab find role button click --name "Missões"
sleep 1.5
echo "--- antes de coletar: ---"
agent-browser get text "main" | grep -iE "recompensa pronta|coletar" | head -3
ab find role button click --name "Coletar recompensa"
sleep 2.5
agent-browser get text "main" | grep -iE "Zeni,|Missão cumprida|iniciar" | head -4

echo ""
echo "=== 4. GUILDA: CRIAR (5000 Zeni) ==="
ab find role button click --name "Guildas"
sleep 2
ab find role button click --name "Fundar guilda"
sleep 1
ab find label "Nome da guilda" fill "Guerreiros Z"
ab find role button click --name "5.000 Zeni"
sleep 2.5
echo "--- após criar: ---"
agent-browser get text "main" | grep -iE "fundada|Guerreiros Z|Membros|líder" | head -5

echo ""
echo "=== 5. RANKING COM BADGE DE GUILDA ==="
ab find role button click --name "Ranking"
sleep 1.5
agent-browser get text "main" | grep -iE "Guerreiros Z" | head -2

echo ""
echo "=== 6. BATALHA COM TÉCNICA (vs Saibaman) ==="
ab find role button click --name "Batalha"
sleep 1.5
ab find role button click --name "Lutar"
sleep 4
agent-browser get text "body" | grep -iE "TÉCNICA|Rogafufuken|VITÓRIA|DERROTA" | head -4
# fecha dialog se aberto
ab find role button click --name "Continuar" || true
sleep 1

echo ""
echo "=== 7. TROCAR DE PERSONAGEM ==="
ab find role button click --name "Menu do jogador"
sleep 1
ab find role menuitem click --name "Trocar de personagem"
sleep 2.5
echo "--- deve mostrar seleção de personagens: ---"
ab snapshot -i -c | head -8

echo ""
echo "=== 8. CRIAR SEGUNDO PERSONAGEM ==="
ab find role button click --name "Criar novo guerreiro"
sleep 1.5
ab find role button click --name "Sortear nome aleatório de guerreiro"
sleep 1
NAME2=$(agent-browser get value "#warrior-name" 2>/dev/null)
echo "nome 2 sorteado: $NAME2"
ab find role button click --name "Começar como Majin"
sleep 3
ab snapshot -i -c | head -4

echo ""
echo "=== 9. SAIR DA CONTA ==="
ab find role button click --name "Menu do jogador"
sleep 1
ab find role menuitem click --name "Sair da conta"
sleep 2
echo "--- deve voltar para o login: ---"
ab snapshot -i -c | head -6

echo ""
echo "=== 10. LOGIN DE VOLTA ==="
ab find label "Usuário" fill "heroi_teste"
ab find label "Senha" fill "senha123"
ab find role button click --name "Entrar no universo"
sleep 2.5
echo "--- deve mostrar seleção com 2 personagens: ---"
ab snapshot -i -c | head -10

echo ""
echo "=== ERROS NO LOG DO SERVIDOR? ==="
grep -acE "Erro| 500 " /tmp/dev-test2.log || echo "0 erros"

kill $SERVER_PID 2>/dev/null
echo "=== BATERIA 2 CONCLUÍDA ==="
